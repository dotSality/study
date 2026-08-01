// Критерии приёмки контрольной точки 1, слой 3. Каждый тест — дословная
// формулировка из программы курса, переведённая в ассерт. Если этот файл
// зелёный, а слой 2 сошёлся с эталоном, ядро принято.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine as api } from './adapter.mjs';

const STEP_MS = api.fixedStepMs;

test('КТ1: fixed step makes the calculated number of simulation steps', () => {
  const source = api.newManualSource(0);
  const engine = api.newEngine(source, { capacity: 8, eventCapacity: 8 });
  let steps = 0;
  engine.addSystem({ name: 'sim', phase: 'fixed', update: () => (steps += 1) });

  // Модельное время — целое число шагов; первый кадр дельты не имеет,
  // поэтому кадров на один больше, чем шагов.
  const expectedSteps = 60;
  for (let i = 0; i <= expectedSteps; i += 1) {
    engine.tick(i * STEP_MS);
  }

  const report = engine.report();
  assert.equal(steps, expectedSteps);
  assert.equal(report.steps, expectedSteps);
  assert.equal(report.frame, expectedSteps + 1);
  assert.equal(report.gameMs, expectedSteps * STEP_MS);
  // Остаток аккумулятора нулевой, значит время не потерялось и не удвоилось.
  assert.ok(report.alpha < 1e-9, `alpha must be ~0, got ${report.alpha}`);
  assert.equal(report.droppedMs, 0);
});

test('КТ1: moving a parent recomputes the world matrix of every descendant and of nobody else', () => {
  const source = api.newManualSource(0);
  const engine = api.newEngine(source, { capacity: 8, eventCapacity: 8 });

  // Дерево: корень (есть у ядра) → камера (есть у ядра) → и наша ветка
  // parent → child → grandchild плюс отдельный сосед.
  const parent = api.newNode('parent');
  const child = api.newNode('child');
  const grandchild = api.newNode('grandchild');
  const stranger = api.newNode('stranger');
  api.addChild(engine.root, parent);
  api.addChild(parent, child);
  api.addChild(child, grandchild);
  api.addChild(engine.root, stranger);

  // Первый кадр считает всё: до него ни одна матрица не собиралась.
  engine.tick(0);
  const nodes = engine.report().graph.nodes;
  assert.equal(nodes, 6);
  assert.equal(engine.report().graph.worldRecomputed, nodes);

  engine.graph.resetStats();
  api.setLocalPosition(parent, 1, 0, 0);
  engine.tick(STEP_MS);

  const graph = engine.report().graph;
  assert.equal(graph.traversals, 1);
  assert.equal(graph.visited, nodes, 'the walk is full even when one node moved');
  assert.equal(graph.localRecomputed, 1, 'only the moved node rebuilds its local matrix');
  assert.equal(graph.worldRecomputed, 3, 'parent, child, grandchild and nobody else');
});

test('КТ1: creating and destroying entities does not disturb the order of systems', () => {
  const source = api.newManualSource(0);
  const engine = api.newEngine(source, { capacity: 8, eventCapacity: 8 });
  const store = api.newVectorStore({ name: 'position', capacity: 8, entityCapacity: 8 });
  engine.addStore(store);

  const log = [];
  let frame = 0;

  engine.addSystem({
    name: 'spawner',
    phase: 'fixed',
    order: 0,
    update() {
      log.push('spawner');
      // Каждый шаг: одна сущность рождается, одна из живущих приговаривается.
      store.add(engine.spawn(), frame, 0, 0);
      if (store.size > 1) engine.despawn(store.owners[0]);
    },
  });

  engine.addSystem({
    name: 'walker',
    phase: 'fixed',
    order: 1,
    update() {
      log.push(`walker:${store.size}`);
      // Обход плотного массива идёт по живым и только по ним: приговорённая
      // сущность уходит из хранилища не здесь, а в уборке ядра.
      for (let i = 0; i < store.size; i += 1) {
        assert.equal(engine.world.entities.isAlive(store.owners[i]), true);
      }
    },
  });

  engine.addSystem({ name: 'sync', phase: 'update', order: 0, update: () => log.push('sync') });

  for (frame = 1; frame <= 5; frame += 1) {
    log.length = 0;
    engine.tick(frame * STEP_MS);
    if (frame === 1) {
      // Первый кадр дельты не имеет: фаза fixed не выполняется вовсе.
      assert.deepEqual(log, ['sync']);
    } else {
      // На втором кадре в хранилище только новорождённый; дальше их всегда
      // двое — новый и приговорённый, которого уборка снимет в конце шага.
      const alive = frame === 2 ? 1 : 2;
      assert.deepEqual(log, ['spawner', `walker:${alive}`, 'sync']);
    }
  }

  const report = engine.report();
  assert.equal(report.world.spawned, 4);
  assert.equal(report.world.despawned, 3);
  assert.equal(report.entities.destroyed, 3);
  assert.equal(report.entities.alive, 1);
  assert.equal(report.world.pending, 0, 'the reaper emptied the queue inside the same step');
  assert.equal(store.size, 1);
});
