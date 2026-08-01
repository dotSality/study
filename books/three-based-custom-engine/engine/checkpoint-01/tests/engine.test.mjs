// Слой 3: собранное ядро. Проверяется не то, как работает каждая часть
// по отдельности (это сделали главы 1–4), а то, что они соединены именно так,
// как объявлено: порядок фаз, порядок запуска подсистем, отказ конфигурации.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine as api } from './adapter.mjs';

const STEP_MS = api.fixedStepMs;

function build(config) {
  const source = api.newManualSource(0);
  return { source, engine: api.newEngine(source, config) };
}

test('a fresh engine carries three core systems and no others', () => {
  const { engine } = build();
  const report = engine.report();
  assert.deepEqual(report.systems, { input: 0, fixed: 2, update: 1, render: 0 });
  assert.equal(report.subsystems, 0);
  // Корень и узел камеры — это уже граф: ядро отдаёт сцену, а не пустоту.
  assert.equal(report.graph.nodes, 2);
});

test('an omitted config is filled from the defaults', () => {
  const resolved = api.resolveConfig({});
  assert.equal(resolved.capacity, api.defaultConfig.capacity);
  assert.equal(resolved.eventCapacity, api.defaultConfig.eventCapacity);
  assert.equal(resolved.fixedStep.stepMs, api.defaultConfig.stepMs);
  assert.equal(resolved.fixedStep.maxFrameMs, api.defaultConfig.maxFrameMs);
  assert.equal(resolved.fixedStep.maxStepsPerFrame, api.defaultConfig.maxStepsPerFrame);
});

test('a nonsense config is refused instead of silently repaired', () => {
  assert.throws(() => api.resolveConfig({ capacity: 0 }), /capacity/);
  assert.throws(() => api.resolveConfig({ capacity: 1.5 }), /capacity/);
  assert.throws(() => api.resolveConfig({ capacity: api.maxCapacity + 1 }), /capacity/);
  assert.throws(() => api.resolveConfig({ eventCapacity: -4 }), /eventCapacity/);
  assert.throws(() => api.resolveConfig({ stepMs: 0 }), /stepMs/);
  assert.throws(() => api.resolveConfig({ maxStepsPerFrame: 0 }), /maxStepsPerFrame/);
  // Потолок кадра ниже шага означал бы симуляцию, которая не шагает никогда.
  assert.throws(() => api.resolveConfig({ stepMs: 20, maxFrameMs: 10 }), /maxFrameMs/);
});

test('subsystems start in registration order and stop in the reverse one', () => {
  const { engine } = build();
  const log = [];
  for (const name of ['files', 'audio', 'view']) {
    engine.addSubsystem({
      name,
      start: () => log.push(`start:${name}`),
      stop: () => log.push(`stop:${name}`),
    });
  }

  engine.start();
  engine.stop();

  assert.deepEqual(log, [
    'start:files',
    'start:audio',
    'start:view',
    'stop:view',
    'stop:audio',
    'stop:files',
  ]);
});

test('a repeated start does not start the subsystems twice', () => {
  const { engine } = build();
  let starts = 0;
  engine.addSubsystem({ name: 'view', start: () => (starts += 1) });
  engine.start();
  engine.start();
  assert.equal(starts, 1);
  assert.equal(engine.started, true);
});

test('a subsystem registered on a running engine starts at once', () => {
  const { engine } = build();
  engine.start();
  let started = false;
  engine.addSubsystem({ name: 'late', start: () => (started = true) });
  assert.equal(started, true);
});

test('two systems cannot share a name', () => {
  const { engine } = build();
  const system = { name: 'motion', phase: 'fixed', update() {} };
  engine.addSystem(system);
  assert.throws(() => engine.addSystem({ ...system }), /already registered/);
});

test('a core system cannot be removed', () => {
  const { engine } = build();
  assert.throws(() => engine.removeSystem(api.coreSystems.events), /core system/);
  assert.throws(() => engine.removeSystem(api.coreSystems.reaper), /core system/);
  assert.throws(() => engine.removeSystem(api.coreSystems.transforms), /core system/);
  assert.equal(engine.removeSystem('never-registered'), false);
});

test('a removed system stops receiving frames and frees its name', () => {
  const { source, engine } = build();
  let calls = 0;
  engine.addSystem({ name: 'motion', phase: 'fixed', update: () => (calls += 1) });
  engine.start();
  source.frame(0);
  source.frame(STEP_MS);
  assert.equal(calls, 1);

  assert.equal(engine.removeSystem('motion'), true);
  assert.equal(engine.report().systems.fixed, 2);
  source.frame(STEP_MS * 2);
  assert.equal(calls, 1);
  // Имя освободилось: тот же модуль можно зарегистрировать заново.
  engine.addSystem({ name: 'motion', phase: 'fixed', update: () => (calls += 1) });
  source.frame(STEP_MS * 3);
  assert.equal(calls, 2);
});

test('game systems of a phase run before the core systems of the same phase', () => {
  const { engine } = build({ capacity: 8, eventCapacity: 8 });
  const log = [];
  engine.addSystem({ name: 'motion', phase: 'fixed', order: 0, update: () => log.push('motion') });
  engine.addSystem({ name: 'sync', phase: 'update', order: 0, update: () => log.push('sync') });
  engine.addSystem({ name: 'draw', phase: 'render', update: () => log.push('draw') });
  engine.events.subscribe(7, () => log.push('handler'));

  engine.addSystem({
    name: 'sender',
    phase: 'fixed',
    order: 1,
    update: () => engine.events.post(7),
  });

  // Первый кадр дельты не имеет, поэтому фазы fixed в нём нет вовсе.
  engine.tick(0);
  assert.deepEqual(log, ['sync', 'draw']);

  log.length = 0;
  engine.tick(STEP_MS);

  // Порядок фаз — input, fixed, update, render; внутри fixed игровые системы
  // идут раньше доставки событий, потому что порядок ядра больше их порядка.
  assert.deepEqual(log, ['motion', 'handler', 'sync', 'draw']);
});

test('the engine walks the scene graph exactly once per frame', () => {
  const { engine } = build();
  const frames = 10;
  for (let i = 1; i <= frames; i += 1) {
    engine.tick(i * STEP_MS);
  }
  const report = engine.report();
  assert.equal(report.frame, frames);
  assert.equal(report.graph.traversals, frames);
  assert.equal(report.graph.visited, frames * report.graph.nodes);
});

test('reset returns the engine to the state before the first frame', () => {
  const { engine } = build({ capacity: 8, eventCapacity: 8 });
  const store = api.newVectorStore({ name: 'position', capacity: 8, entityCapacity: 8 });
  engine.addStore(store);
  const entity = engine.spawn();
  store.add(entity, 1, 2, 3);
  engine.events.post(1, entity);
  for (let i = 1; i <= 5; i += 1) engine.tick(i * STEP_MS);

  const before = engine.report();
  assert.equal(before.frame, 5);
  assert.ok(before.entities.created > 0);

  engine.reset();
  const after = engine.report();

  assert.equal(after.frame, 0);
  assert.equal(after.steps, 0);
  assert.equal(after.gameMs, 0);
  assert.equal(after.realMs, 0);
  assert.equal(after.entities.created, 0);
  assert.equal(after.entities.alive, 0);
  assert.equal(after.events.posted, 0);
  assert.equal(after.events.queued, 0);
  assert.equal(after.graph.traversals, 0);
  // Хранилища тоже опустели: сброс, забывший про них, оставил бы компоненты
  // мёртвых сущностей на местах живых.
  assert.equal(store.size, 0);
  assert.equal(store.has(entity), false);
});

test('two runs of the same script give the same report', () => {
  const { engine } = build({ capacity: 8, eventCapacity: 8 });
  const store = api.newVectorStore({ name: 'position', capacity: 8, entityCapacity: 8 });
  engine.addStore(store);
  engine.addSystem({
    name: 'motion',
    phase: 'fixed',
    update() {
      for (let i = 0; i < store.size; i += 1) store.x[i] += 1;
    },
  });

  function run() {
    engine.reset();
    store.add(engine.spawn(), 0, 0, 0);
    for (let i = 1; i <= 7; i += 1) engine.tick(i * STEP_MS);
    return { report: engine.report(), x: store.x[0] };
  }

  const first = run();
  const second = run();
  assert.deepEqual(second, first);
});

test('starting the engine opens the frame source, stopping it closes it', () => {
  const { source, engine } = build();
  assert.equal(engine.running, false);
  engine.start();
  assert.equal(engine.running, true);
  assert.equal(source.pending, true);
  engine.stop();
  assert.equal(engine.running, false);
  assert.equal(engine.started, false);
});
