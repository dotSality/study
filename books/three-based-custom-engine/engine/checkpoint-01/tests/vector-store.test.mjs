// Слой 3: раскладка «структура массивов». Проверяется, что значения лежат
// в трёх сплошных массивах и что одинарная точность — это плата, а не мелочь.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

function positions(capacity, entityCapacity = 64) {
  return engine.newVectorStore({ name: 'position', capacity, entityCapacity });
}

test('a vector store allocates its arrays once and for all', () => {
  const store = positions(16);
  assert.equal(store.x.length, 16);
  assert.equal(store.x.byteLength, 64, 'sixteen values of four bytes');
  assert.equal(store.size, 0);
});

test('each entity gets one cell in every array', () => {
  const registry = engine.newRegistry(64);
  const store = positions(4);
  const a = registry.create();
  const b = registry.create();
  assert.equal(store.add(a, 1, 2, 3), 0);
  assert.equal(store.add(b, 4, 5, 6), 1);
  assert.equal(store.size, 2);
  assert.deepEqual([...store.x.subarray(0, 2)], [1, 4]);
  assert.deepEqual([...store.y.subarray(0, 2)], [2, 5]);
  assert.deepEqual([...store.z.subarray(0, 2)], [3, 6]);
});

test('single precision rounds the value that was written', () => {
  const registry = engine.newRegistry(64);
  const store = positions(2);
  const entity = registry.create();
  store.add(entity, 0.1, 1 / 3, 16777217);
  // Число JavaScript — двойная точность; Float32Array хранит одинарную.
  assert.notEqual(store.x[0], 0.1);
  assert.equal(store.x[0], 0.10000000149011612);
  assert.equal(store.y[0], 0.3333333432674408);
  // 2²⁴ + 1 в одинарной точности не представимо и округляется до 2²⁴.
  assert.equal(store.z[0], 16777216);
});

test('adding an existing entity overwrites its cell in place', () => {
  const registry = engine.newRegistry(64);
  const store = positions(4);
  const entity = registry.create();
  const slot = store.add(entity, 1, 1, 1);
  assert.equal(store.add(entity, 2, 2, 2), slot);
  assert.equal(store.size, 1);
  assert.equal(store.x[slot], 2);
});

test('remove copies the last cell into the hole', () => {
  const registry = engine.newRegistry(64);
  const store = positions(4);
  const a = registry.create();
  const b = registry.create();
  const c = registry.create();
  store.add(a, 1, 0, 0);
  store.add(b, 2, 0, 0);
  store.add(c, 3, 0, 0);
  assert.equal(store.remove(b), true);
  assert.equal(store.size, 2);
  assert.deepEqual([...store.x.subarray(0, 2)], [1, 3]);
  assert.equal(store.slotOf(c), 1);
  assert.equal(store.slotOf(b), -1);
});

test('a stale handle does not reach the new tenant cell', () => {
  const registry = engine.newRegistry(64);
  const store = positions(4);
  const stale = registry.create();
  store.add(stale, 9, 9, 9);
  store.remove(stale);
  registry.destroy(stale);
  const tenant = registry.create();
  store.add(tenant, 1, 1, 1);
  assert.equal(store.has(stale), false);
  assert.equal(store.slotOf(tenant), 0);
});

test('an exhausted vector store refuses instead of growing', () => {
  const registry = engine.newRegistry(64);
  const store = positions(1);
  store.add(registry.create(), 0, 0, 0);
  assert.throws(() => store.add(registry.create(), 0, 0, 0), RangeError);
  assert.equal(store.denied, 1);
});

test('a batch pass over the arrays touches every live cell exactly once', () => {
  const registry = engine.newRegistry(64);
  const store = positions(32);
  for (let i = 0; i < 20; i += 1) {
    store.add(registry.create(), i, 0, 0);
  }
  let sum = 0;
  for (let i = 0; i < store.size; i += 1) {
    sum += store.x[i];
  }
  assert.equal(sum, 190, 'sum of 0..19');
  assert.equal(store.size, 20);
});
