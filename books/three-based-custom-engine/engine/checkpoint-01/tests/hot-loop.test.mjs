// Дисциплина кадра на собранном ядре: критерий «ноль аллокаций в горячем
// цикле» проверяется тождеством объектов, а не наблюдением за сборщиком мусора.
// Сборки мусора — величина плавающая (§2.4.1), а «системе каждый кадр приходит
// тот же самый объект» — факт, который либо есть, либо его нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine as api } from './adapter.mjs';

const STEP_MS = api.fixedStepMs;
const FRAMES = 200;

test('КТ1: every phase of every frame gets one and the same frame object', () => {
  const engine = api.newEngine(api.newManualSource(0), { capacity: 8, eventCapacity: 8 });
  const seen = new Set();
  for (const phase of api.phases) {
    engine.addSystem({ name: `probe:${phase}`, phase, update: (frame) => seen.add(frame) });
  }

  for (let i = 0; i <= FRAMES; i += 1) engine.tick(i * STEP_MS);

  // Один объект на все фазы и все кадры: цикл заполняет его на месте.
  assert.equal(seen.size, 1);
  assert.equal(engine.report().frame, FRAMES + 1);
});

test('КТ1: the event queue hands out objects from its stock and never new ones', () => {
  const capacity = 8;
  const engine = api.newEngine(api.newManualSource(0), { capacity: 8, eventCapacity: capacity });
  const seen = new Set();
  engine.events.subscribe(1, (event) => seen.add(event));
  engine.addSystem({
    name: 'sender',
    phase: 'fixed',
    order: 0,
    update: () => engine.events.post(1),
  });

  for (let i = 0; i <= FRAMES; i += 1) engine.tick(i * STEP_MS);

  const report = engine.report();
  assert.equal(report.events.posted, FRAMES);
  assert.equal(report.events.delivered, FRAMES);
  // Двести доставленных событий — не двести объектов: их всего столько,
  // сколько заказано ёмкостью, и обычно меньше.
  assert.ok(seen.size <= capacity, `${seen.size} distinct event objects for capacity ${capacity}`);
});

test('КТ1: walking the graph reuses its stacks instead of building new ones', () => {
  const engine = api.newEngine(api.newManualSource(0), { capacity: 8, eventCapacity: 8 });
  const nodes = [];
  for (let i = 0; i < 16; i += 1) {
    const node = api.newNode(`body-${i}`);
    api.addChild(engine.root, node);
    nodes.push(node);
  }

  engine.addSystem({
    name: 'move',
    phase: 'update',
    order: 0,
    update() {
      for (let i = 0; i < nodes.length; i += 1) api.setLocalPosition(nodes[i], i, 0, 0);
    },
  });

  // Матрицы узлов — те же объекты на всём прогоне: обход пишет в них на месте,
  // а не собирает новую матрицу и не подменяет ссылку.
  const before = nodes.map((node) => node.worldMatrix);
  for (let i = 0; i <= FRAMES; i += 1) engine.tick(i * STEP_MS);
  const after = nodes.map((node) => node.worldMatrix);

  for (let i = 0; i < nodes.length; i += 1) {
    assert.equal(after[i], before[i], `world matrix of node ${i} was replaced`);
  }
  const graph = engine.report().graph;
  assert.equal(graph.traversals, FRAMES + 1);
  assert.equal(graph.visited, (FRAMES + 1) * graph.nodes);
});
