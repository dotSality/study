// Цикл кадра: единственное место, где встречаются источник кадров, часы,
// фиксированный шаг и фазы. Всё остальное движка о времени не знает.

import { createClock, tickClock } from './clock.ts';
import type { EngineClock } from './clock.ts';
import { advanceFixedStep, createFixedStep, DEFAULT_FIXED_STEP } from './fixed-step.ts';
import type { FixedStepConfig, FixedStepState } from './fixed-step.ts';
import type { FrameSource } from './frame-source.ts';
import type { MutableFrameInfo, Scheduler } from './scheduler.ts';

export interface LoopOptions {
  readonly source: FrameSource;
  readonly scheduler: Scheduler;
  readonly clock?: EngineClock;
  readonly fixedStep?: FixedStepState;
  readonly config?: FixedStepConfig;
}

export interface Loop {
  readonly clock: EngineClock;
  readonly fixedStep: FixedStepState;
  /** Кадров с запуска. */
  readonly frame: number;
  /** Шагов симуляции с запуска. */
  readonly steps: number;
  readonly running: boolean;
  start(): void;
  stop(): void;
  /** Один кадр вручную: так цикл гоняют тесты и стенд. */
  tick(nowMs: number): void;
  /** Забыть отметку времени прошлого кадра — после паузы вкладки или загрузки. */
  resetTime(): void;
}

export function createLoop(options: LoopOptions): Loop {
  const source = options.source;
  const scheduler = options.scheduler;
  const clock = options.clock ?? createClock();
  const fixedStep = options.fixedStep ?? createFixedStep();
  const config = options.config ?? DEFAULT_FIXED_STEP;

  // Один объект на всё время работы: подсистемы получают его в каждой фазе.
  const info: MutableFrameInfo = {
    frame: 0,
    phase: 'input',
    deltaMs: 0,
    alpha: 0,
    gameMs: 0,
  };

  let previousMs: number | null = null;
  let handle = 0;
  let running = false;
  let steps = 0;

  function tick(nowMs: number): void {
    // Первый кадр после запуска или сброса времени: дельты ещё нет.
    const realDelta = previousMs === null ? 0 : nowMs - previousMs;
    previousMs = nowMs;

    const gameDelta = tickClock(clock, realDelta);
    advanceFixedStep(fixedStep, gameDelta, config);
    steps += fixedStep.steps;

    info.frame += 1;
    info.gameMs = clock.gameMs;

    info.phase = 'input';
    info.deltaMs = clock.frameRealMs;
    info.alpha = 0;
    scheduler.run('input', info);

    // Симуляция идёт целыми шагами постоянной длительности — сколько бы их ни было.
    info.phase = 'fixed';
    info.deltaMs = config.stepMs;
    for (let i = 0; i < fixedStep.steps; i += 1) {
      scheduler.run('fixed', info);
    }

    // Всё, что живёт по времени кадра, а не по шагу: камера, интерфейс, анимация.
    info.phase = 'update';
    info.deltaMs = gameDelta;
    info.alpha = fixedStep.alpha;
    scheduler.run('update', info);

    info.phase = 'render';
    scheduler.run('render', info);
  }

  function onFrame(nowMs: number): void {
    if (!running) return;
    tick(nowMs);
    // Следующий кадр запрашивается после расчёта — так же поступает и three.js
    // в WebGLAnimation (0.185.1): сначала вызов, потом requestAnimationFrame.
    handle = source.request(onFrame);
  }

  return {
    clock,
    fixedStep,

    get frame() {
      return info.frame;
    },

    get steps() {
      return steps;
    },

    get running() {
      return running;
    },

    start() {
      if (running) return;
      running = true;
      previousMs = null;
      handle = source.request(onFrame);
    },

    stop() {
      if (!running) return;
      running = false;
      source.cancel(handle);
    },

    tick,

    resetTime() {
      previousMs = null;
    },
  };
}
