// Ядро движка: цикл кадра (глава 2), граф сцены с камерой (глава 3) и модель
// мира (глава 4), соединённые в одно целое. Новых идей здесь нет — есть
// порядок: кто кого создаёт, кто в какой фазе получает управление, кто
// запускается первым и кто останавливается последним.

import { createCamera } from './camera.ts';
import type { Camera } from './camera.ts';
import { createClock } from './clock.ts';
import type { EngineClock } from './clock.ts';
import type { EntityStore } from './component-store.ts';
import { resolveEngineConfig } from './config.ts';
import type { EngineConfig, ResolvedEngineConfig } from './config.ts';
import type { Entity } from './entity.ts';
import { createEventQueue } from './events.ts';
import type { EventQueue } from './events.ts';
import { createFixedStep } from './fixed-step.ts';
import type { FixedStepState } from './fixed-step.ts';
import type { FrameSource } from './frame-source.ts';
import { createLoop } from './loop.ts';
import { addChild, countNodes, createSceneGraph, createSceneNode } from './scene-graph.ts';
import type { SceneGraph, SceneNode } from './scene-graph.ts';
import { createScheduler } from './scheduler.ts';
import type { FrameInfo, Phase, System } from './scheduler.ts';
import { createWorld } from './world.ts';
import type { World } from './world.ts';

/**
 * Подсистема с собственным временем жизни: у неё есть что включить при запуске
 * движка и что отпустить при остановке. Порядок запуска — порядок регистрации,
 * порядок останова — обратный (E1-I, 6.1).
 */
export interface Subsystem {
  readonly name: string;
  start?(): void;
  stop?(): void;
}

/**
 * Имена систем, которые ядро заводит само. Игровая система с таким именем
 * зарегистрирована не будет: ядро отвечает за то, что доставка событий и уборка
 * происходят ровно один раз за шаг и в известном месте.
 */
export const CORE_SYSTEMS = {
  events: 'core:events',
  reaper: 'core:reaper',
  transforms: 'core:transforms',
} as const;

/**
 * Места ядра в порядке фаз. Игровые системы по умолчанию имеют order 0, то есть
 * идут раньше; чтобы встать после ядра, порядок задаётся числом больше этого.
 */
export const CORE_ORDER = {
  events: 1_000,
  reaper: 2_000,
  transforms: 1_000,
} as const;

/** Счётчики слоя 1 на весь движок: одинаковы на любой машине. */
export interface EngineReport {
  frame: number;
  steps: number;
  alpha: number;
  gameMs: number;
  realMs: number;
  droppedMs: number;
  entities: {
    alive: number;
    used: number;
    created: number;
    destroyed: number;
    reused: number;
    denied: number;
    wrapped: number;
  };
  world: {
    spawned: number;
    despawned: number;
    flushed: number;
    pending: number;
    pendingPeak: number;
    dropped: number;
    stores: number;
  };
  events: {
    posted: number;
    delivered: number;
    deferred: number;
    unheard: number;
    dropped: number;
    peak: number;
    queued: number;
  };
  graph: {
    nodes: number;
    traversals: number;
    visited: number;
    localRecomputed: number;
    worldRecomputed: number;
  };
  systems: Record<Phase, number>;
  subsystems: number;
}

export interface EngineOptions {
  /** Откуда приходят кадры: браузер в игре, ручной источник в проверках. */
  readonly source: FrameSource;
  readonly config?: EngineConfig;
}

export interface Engine {
  readonly config: ResolvedEngineConfig;
  readonly clock: EngineClock;
  readonly fixedStep: FixedStepState;
  readonly world: World;
  readonly events: EventQueue;
  readonly graph: SceneGraph;
  /** Корень графа сцены: сюда вешается всё, что должно двигаться. */
  readonly root: SceneNode;
  /** Узел камеры — обычный узел графа, его можно двигать и присоединять. */
  readonly cameraNode: SceneNode;
  readonly camera: Camera;
  /** Кадров с последнего сброса. */
  readonly frame: number;
  /** Шагов симуляции с последнего сброса. */
  readonly steps: number;
  /** Идёт ли подача кадров. */
  readonly running: boolean;
  /** Запущены ли подсистемы. */
  readonly started: boolean;
  addStore(store: EntityStore): void;
  addSystem(system: System): void;
  removeSystem(name: string): boolean;
  addSubsystem(subsystem: Subsystem): void;
  spawn(): Entity;
  despawn(entity: Entity): boolean;
  /** Запустить подсистемы в порядке регистрации и открыть подачу кадров. */
  start(): void;
  /** Закрыть подачу кадров и остановить подсистемы в обратном порядке. */
  stop(): void;
  /** Один кадр вручную: так движок гоняют тесты и стенд. */
  tick(nowMs: number): void;
  resetTime(): void;
  /** Вернуть движок в состояние до первого кадра, не разбирая его на части. */
  reset(): void;
  report(): EngineReport;
}

export function createEngine(options: EngineOptions): Engine {
  const config = resolveEngineConfig(options.config);

  // Порядок создания продиктован зависимостями: часы и шаг нужны циклу,
  // реестр сущностей — хранилищам, узел камеры — камере.
  const clock = createClock();
  const fixedStep = createFixedStep();
  const scheduler = createScheduler();
  const world = createWorld(config.capacity);
  const events = createEventQueue(config.eventCapacity);

  const root = createSceneNode('root');
  const cameraNode = createSceneNode('camera');
  addChild(root, cameraNode);
  const graph = createSceneGraph(root);
  const camera = createCamera(cameraNode);

  const loop = createLoop({
    source: options.source,
    scheduler,
    clock,
    fixedStep,
    config: config.fixedStep,
  });

  const subsystems: Subsystem[] = [];
  // Имя системы → её фаза. Заодно это и проверка на повтор имени: две системы
  // с одним именем сделали бы `removeSystem` неоднозначным.
  const systemPhase = new Map<string, Phase>();
  const systemCount: Record<Phase, number> = { input: 0, fixed: 0, update: 0, render: 0 };
  let started = false;

  function register(system: System): void {
    if (systemPhase.has(system.name)) {
      throw new RangeError(`system "${system.name}" is already registered`);
    }
    systemPhase.set(system.name, system.phase);
    systemCount[system.phase] += 1;
    scheduler.add(system);
  }

  // Три системы ядра. Они зарегистрированы до всех игровых, но стоят позже них
  // по order: сначала мир меняют, потом рассылают последствия, потом убирают.
  register({
    name: CORE_SYSTEMS.events,
    phase: 'fixed',
    order: CORE_ORDER.events,
    update(frame: FrameInfo) {
      events.dispatch(frame.gameMs);
    },
  });

  register({
    name: CORE_SYSTEMS.reaper,
    phase: 'fixed',
    order: CORE_ORDER.reaper,
    update() {
      world.flush();
    },
  });

  register({
    name: CORE_SYSTEMS.transforms,
    phase: 'update',
    order: CORE_ORDER.transforms,
    update() {
      // Один обход за кадр (Р3.3), камера — сразу после него (Р3.5).
      graph.update();
      camera.update();
    },
  });

  const engine: Engine = {
    config,
    clock,
    fixedStep,
    world,
    events,
    graph,
    root,
    cameraNode,
    camera,

    get frame() {
      return loop.frame;
    },

    get steps() {
      return loop.steps;
    },

    get running() {
      return loop.running;
    },

    get started() {
      return started;
    },

    addStore(store) {
      world.addStore(store);
    },

    addSystem(system) {
      register(system);
    },

    removeSystem(name) {
      if (
        name === CORE_SYSTEMS.events ||
        name === CORE_SYSTEMS.reaper ||
        name === CORE_SYSTEMS.transforms
      ) {
        throw new RangeError(`core system "${name}" cannot be removed`);
      }
      const phase = systemPhase.get(name);
      if (phase === undefined) return false;
      systemPhase.delete(name);
      systemCount[phase] -= 1;
      return scheduler.remove(name);
    },

    addSubsystem(subsystem) {
      subsystems.push(subsystem);
      if (started) {
        // Движок уже работает: опоздавшая подсистема запускается сразу,
        // иначе она осталась бы выключенной до следующего запуска.
        subsystem.start?.();
      }
    },

    spawn() {
      return world.spawn();
    },

    despawn(entity) {
      return world.despawn(entity);
    },

    start() {
      if (!started) {
        for (let i = 0; i < subsystems.length; i += 1) {
          subsystems[i].start?.();
        }
        started = true;
      }
      loop.start();
    },

    stop() {
      loop.stop();
      if (!started) return;
      // Обратный порядок: подсистема отпускает своё раньше, чем исчезнет то,
      // на что она опирается (E1-I, 6.1).
      for (let i = subsystems.length - 1; i >= 0; i -= 1) {
        subsystems[i].stop?.();
      }
      started = false;
    },

    tick(nowMs) {
      loop.tick(nowMs);
    },

    resetTime() {
      loop.resetTime();
    },

    reset() {
      loop.reset();
      world.reset();
      const stores = world.stores;
      for (let i = 0; i < stores.length; i += 1) {
        stores[i].clear();
      }
      events.clear();
      events.resetStats();
      // Именно reset(), а не resetStats(): граф, помнящий, что уже посчитал,
      // даёт на втором прогоне другие числа пересчётов (часть 5.2).
      graph.reset();
    },

    report() {
      const entities = world.entities;
      return {
        frame: loop.frame,
        steps: loop.steps,
        alpha: fixedStep.alpha,
        gameMs: clock.gameMs,
        realMs: clock.realMs,
        droppedMs: fixedStep.droppedMs,
        entities: {
          alive: entities.alive,
          used: entities.used,
          created: entities.stats.created,
          destroyed: entities.stats.destroyed,
          reused: entities.stats.reused,
          denied: entities.stats.denied,
          wrapped: entities.stats.wrapped,
        },
        world: {
          spawned: world.stats.spawned,
          despawned: world.stats.despawned,
          flushed: world.stats.flushed,
          pending: world.pending,
          pendingPeak: world.stats.pendingPeak,
          dropped: world.stats.dropped,
          stores: world.stores.length,
        },
        events: {
          posted: events.stats.posted,
          delivered: events.stats.delivered,
          deferred: events.stats.deferred,
          unheard: events.stats.unheard,
          dropped: events.stats.dropped,
          peak: events.stats.peak,
          queued: events.size,
        },
        graph: {
          nodes: countNodes(root),
          traversals: graph.stats.traversals,
          visited: graph.stats.visited,
          localRecomputed: graph.stats.localRecomputed,
          worldRecomputed: graph.stats.worldRecomputed,
        },
        systems: {
          input: systemCount.input,
          fixed: systemCount.fixed,
          update: systemCount.update,
          render: systemCount.render,
        },
        subsystems: subsystems.length,
      };
    },
  };

  return engine;
}
