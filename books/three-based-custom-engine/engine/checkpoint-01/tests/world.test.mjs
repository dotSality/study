// Слой 3: мир и отложенное удаление. Проверяется, что система, идущая по
// плотному массиву, не теряет элементы из-за удаления посреди обхода.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

function worldWithStores(capacity = 32) {
  const world = engine.newWorld(capacity);
  const health = engine.newComponentStore({
    name: 'health',
    capacity,
    entityCapacity: capacity,
    create: () => ({ current: 0 }),
    reset: (value) => {
      value.current = 0;
    },
  });
  const position = engine.newVectorStore({
    name: 'position',
    capacity,
    entityCapacity: capacity,
  });
  world.addStore(health);
  world.addStore(position);
  return { world, health, position };
}

test('spawn hands out a live entity', () => {
  const { world } = worldWithStores();
  const entity = world.spawn();
  assert.equal(world.entities.isAlive(entity), true);
  assert.equal(world.stats.spawned, 1);
});

test('despawn does not kill the entity right away', () => {
  const { world, health } = worldWithStores();
  const entity = world.spawn();
  health.add(entity).current = 10;
  assert.equal(world.despawn(entity), true);
  assert.equal(world.entities.isAlive(entity), true, 'still alive until the flush');
  assert.equal(world.isDespawning(entity), true);
  assert.equal(health.size, 1);
  assert.equal(world.pending, 1);
});

test('flush kills the entity and clears every registered store', () => {
  const { world, health, position } = worldWithStores();
  const entity = world.spawn();
  health.add(entity);
  position.add(entity, 1, 2, 3);
  world.despawn(entity);
  assert.equal(world.flush(), 1);
  assert.equal(world.entities.isAlive(entity), false);
  assert.equal(health.size, 0);
  assert.equal(position.size, 0);
  assert.equal(world.pending, 0);
});

test('a repeated despawn within one frame is counted once', () => {
  const { world } = worldWithStores();
  const entity = world.spawn();
  assert.equal(world.despawn(entity), true);
  assert.equal(world.despawn(entity), false);
  assert.equal(world.stats.despawned, 1);
  assert.equal(world.flush(), 1);
});

test('despawning a dead entity is refused', () => {
  const { world } = worldWithStores();
  const entity = world.spawn();
  world.despawn(entity);
  world.flush();
  assert.equal(world.despawn(entity), false);
});

test('a system may despawn while walking the dense array', () => {
  const { world, health } = worldWithStores();
  const entities = [];
  for (let i = 0; i < 6; i += 1) {
    const entity = world.spawn();
    entities.push(entity);
    health.add(entity).current = i;
  }
  // Система убивает всех с чётным здоровьем прямо во время обхода.
  let visited = 0;
  for (let i = 0; i < health.size; i += 1) {
    visited += 1;
    if (health.values[i].current % 2 === 0) {
      world.despawn(health.owners[i]);
    }
  }
  assert.equal(visited, 6, 'the pass must see every component');
  assert.equal(health.size, 6, 'nothing disappears mid-pass');
  assert.equal(world.flush(), 3);
  assert.equal(health.size, 3);
  const left = [];
  for (let i = 0; i < health.size; i += 1) left.push(health.values[i].current);
  left.sort((a, b) => a - b);
  assert.deepEqual(left, [1, 3, 5]);
});

test('an entity despawned during a flush waits for the next one', () => {
  const { world, health } = worldWithStores();
  const first = world.spawn();
  const second = world.spawn();
  health.add(first);
  health.add(second);
  world.despawn(first);
  // Хранилище, которое во время удаления просит убрать ещё одну сущность.
  world.addStore({
    name: 'chain',
    remove() {
      world.despawn(second);
      return false;
    },
  });
  assert.equal(world.flush(), 1);
  assert.equal(world.entities.isAlive(second), true);
  assert.equal(world.pending, 1);
  assert.equal(world.flush(), 1);
  assert.equal(world.entities.isAlive(second), false);
});

test('the peak queue length is remembered', () => {
  const { world } = worldWithStores();
  const entities = [world.spawn(), world.spawn(), world.spawn()];
  for (const entity of entities) world.despawn(entity);
  world.flush();
  world.despawn(world.spawn());
  assert.equal(world.stats.pendingPeak, 3);
});

test('two runs of the same script give the same world', () => {
  function run() {
    const { world, health, position } = worldWithStores();
    const entities = [];
    for (let i = 0; i < 8; i += 1) {
      const entity = world.spawn();
      entities.push(entity);
      health.add(entity).current = i;
      position.add(entity, i, 0, 0);
    }
    world.despawn(entities[2]);
    world.despawn(entities[5]);
    world.flush();
    const snapshot = [];
    for (let i = 0; i < health.size; i += 1) {
      snapshot.push([health.owners[i], health.values[i].current, position.x[i]]);
    }
    return snapshot;
  }
  assert.deepEqual(run(), run());
});

test('reset empties the world', () => {
  const { world } = worldWithStores();
  world.despawn(world.spawn());
  world.reset();
  assert.equal(world.pending, 0);
  assert.equal(world.entities.alive, 0);
  assert.equal(world.stats.spawned, 0);
});
