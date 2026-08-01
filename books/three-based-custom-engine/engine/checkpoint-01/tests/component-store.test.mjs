// Слой 3: хранилище компонентов. Проверяется плотность массива, переиспользование
// запаса и то, что устаревший дескриптор не добирается до чужого компонента.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

function healthStore(capacity, entityCapacity = 64) {
  let created = 0;
  const store = engine.newComponentStore({
    name: 'health',
    capacity,
    entityCapacity,
    create: () => {
      created += 1;
      return { current: 0, max: 0 };
    },
    reset: (value) => {
      value.current = 0;
      value.max = 0;
    },
  });
  return { store, createdCount: () => created };
}

test('a store builds its whole stock up front', () => {
  const { store, createdCount } = healthStore(8);
  assert.equal(createdCount(), 8);
  assert.equal(store.size, 0);
  assert.equal(store.values.length, 8);
});

test('add hands out a component and marks the entity as an owner', () => {
  const registry = engine.newRegistry(64);
  const { store, createdCount } = healthStore(4);
  const entity = registry.create();
  const health = store.add(entity);
  health.current = 50;
  assert.equal(store.has(entity), true);
  assert.equal(store.get(entity).current, 50);
  assert.equal(store.size, 1);
  assert.equal(createdCount(), 4, 'add must not create anything');
});

test('adding twice returns the same component', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(4);
  const entity = registry.create();
  const first = store.add(entity);
  first.current = 12;
  const second = store.add(entity);
  assert.equal(first, second);
  assert.equal(second.current, 12, 'a repeated add must not wipe the component');
  assert.equal(store.size, 1);
});

test('a component is reset before it goes to a new owner', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(2);
  const first = registry.create();
  store.add(first).current = 99;
  store.remove(first);
  const second = registry.create();
  assert.deepEqual(store.add(second), { current: 0, max: 0 });
});

test('remove closes the hole with the last component', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(4);
  const a = registry.create();
  const b = registry.create();
  const c = registry.create();
  store.add(a).current = 1;
  store.add(b).current = 2;
  store.add(c).current = 3;

  assert.equal(store.remove(b), true);
  assert.equal(store.size, 2);
  // Плотный массив без дыр: на месте удалённого лежит бывший последний.
  assert.deepEqual(
    [store.values[0].current, store.values[1].current],
    [1, 3],
  );
  assert.equal(store.owners[0], a);
  assert.equal(store.owners[1], c);
});

test('the moved component keeps its owner reachable', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(4);
  const a = registry.create();
  const b = registry.create();
  store.add(a).current = 1;
  store.add(b).current = 2;
  store.remove(a);
  assert.equal(store.slotOf(b), 0);
  assert.equal(store.get(b).current, 2);
});

test('a stale handle does not reach the new tenant component', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(4);
  const stale = registry.create();
  store.add(stale).current = 7;
  store.remove(stale);
  registry.destroy(stale);

  const tenant = registry.create();
  assert.equal(engine.entityIndex(tenant), engine.entityIndex(stale));
  store.add(tenant).current = 3;
  assert.equal(store.has(stale), false);
  assert.equal(store.get(stale), null);
  assert.equal(store.get(tenant).current, 3);
});

test('the traversal order after removals is stable across runs', () => {
  function run() {
    const registry = engine.newRegistry(64);
    const { store } = healthStore(8);
    const entities = [];
    for (let i = 0; i < 6; i += 1) {
      const entity = registry.create();
      entities.push(entity);
      store.add(entity).current = i;
    }
    store.remove(entities[1]);
    store.remove(entities[3]);
    const order = [];
    for (let i = 0; i < store.size; i += 1) {
      order.push(store.values[i].current);
    }
    return order;
  }
  const first = run();
  // Порядок обхода — не порядок создания, но воспроизводится точно.
  assert.deepEqual(first, [0, 5, 2, 4]);
  assert.deepEqual(run(), first);
});

test('removing an absent entity reports it and changes nothing', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(4);
  const entity = registry.create();
  assert.equal(store.remove(entity), false);
  assert.equal(store.size, 0);
});

test('an exhausted store refuses instead of growing', () => {
  const registry = engine.newRegistry(64);
  const { store, createdCount } = healthStore(2);
  store.add(registry.create());
  store.add(registry.create());
  assert.throws(() => store.add(registry.create()), RangeError);
  assert.equal(store.denied, 1);
  assert.equal(createdCount(), 2);
});

test('clear empties the store and frees every entity', () => {
  const registry = engine.newRegistry(64);
  const { store } = healthStore(4);
  const a = registry.create();
  const b = registry.create();
  store.add(a);
  store.add(b);
  store.clear();
  assert.equal(store.size, 0);
  assert.equal(store.has(a), false);
  assert.equal(store.has(b), false);
  // После очистки хранилище снова принимает те же сущности.
  assert.equal(store.add(a).current, 0);
});

test('a thousand add-remove cycles create nothing new', () => {
  const registry = engine.newRegistry(64);
  const { store, createdCount } = healthStore(4);
  const entities = [registry.create(), registry.create(), registry.create()];
  for (let i = 0; i < 1000; i += 1) {
    for (const entity of entities) store.add(entity).current = i;
    for (const entity of entities) store.remove(entity);
  }
  assert.equal(createdCount(), 4);
  assert.equal(store.size, 0);
  assert.equal(store.denied, 0);
});
