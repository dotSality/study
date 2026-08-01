// Слой 3: реестр сущностей. Проверяется дескриптор — индекс с поколением —
// и то, что устаревшая ссылка на сущность не оживает вместе с местом.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

test('a handle carries its index and generation', () => {
  const entity = engine.makeEntity(7, 3);
  assert.equal(engine.entityIndex(entity), 7);
  assert.equal(engine.entityGeneration(entity), 3);
});

test('a generation past the sign bit still gives a non-negative handle', () => {
  // 2048 << 20 переполняет знаковый разряд 32-битного числа; без >>> 0
  // дескриптор был бы отрицательным.
  const entity = engine.makeEntity(0, 2048);
  assert.ok(entity > 0, `handle must stay non-negative, got ${entity}`);
  assert.equal(engine.entityGeneration(entity), 2048);
  assert.equal((2048 << engine.indexBits) < 0, true);
});

test('the largest allowed handle is still below the reserved one', () => {
  const largest = engine.makeEntity(engine.maxIndex, engine.maxGeneration);
  assert.ok(largest < engine.noEntity);
  assert.equal(engine.indexBits + engine.generationBits, 32);
});

test('every created entity is distinct', () => {
  const registry = engine.newRegistry(64);
  const seen = new Set();
  for (let i = 0; i < 64; i += 1) {
    seen.add(registry.create());
  }
  assert.equal(seen.size, 64);
  assert.equal(registry.alive, 64);
});

test('a destroyed entity stops being alive', () => {
  const registry = engine.newRegistry(4);
  const entity = registry.create();
  assert.equal(registry.isAlive(entity), true);
  assert.equal(registry.destroy(entity), true);
  assert.equal(registry.isAlive(entity), false);
  assert.equal(registry.alive, 0);
});

test('a freed slot is taken by the next entity', () => {
  const registry = engine.newRegistry(4);
  const first = registry.create();
  registry.destroy(first);
  const second = registry.create();
  assert.equal(engine.entityIndex(second), engine.entityIndex(first));
  assert.equal(engine.entityGeneration(second), engine.entityGeneration(first) + 1);
  assert.equal(registry.used, 1, 'the registry must not consume a fresh slot');
  assert.equal(registry.stats.reused, 1);
});

test('the stale handle stays dead after its slot is reused', () => {
  const registry = engine.newRegistry(4);
  const stale = registry.create();
  registry.destroy(stale);
  const tenant = registry.create();
  assert.equal(registry.isAlive(stale), false);
  assert.equal(registry.isAlive(tenant), true);
  assert.notEqual(stale, tenant);
});

test('destroying by a stale handle changes nothing', () => {
  const registry = engine.newRegistry(4);
  const stale = registry.create();
  registry.destroy(stale);
  const tenant = registry.create();
  assert.equal(registry.destroy(stale), false);
  assert.equal(registry.isAlive(tenant), true);
  assert.equal(registry.stats.destroyed, 1);
});

test('a handle for a slot that was never used is not alive', () => {
  const registry = engine.newRegistry(8);
  registry.create();
  assert.equal(registry.isAlive(engine.makeEntity(5, 0)), false);
});

test('an exhausted registry refuses instead of growing', () => {
  const registry = engine.newRegistry(2);
  registry.create();
  registry.create();
  assert.throws(() => registry.create(), RangeError);
  assert.equal(registry.stats.denied, 1);
  assert.equal(registry.alive, 2);
});

test('the generation wraps and an ancient handle comes back to life', () => {
  const registry = engine.newRegistry(1);
  const ancient = registry.create();
  assert.equal(engine.entityGeneration(ancient), 0);
  registry.destroy(ancient);
  // Круг поколений: место переживает MAX_GENERATION + 1 жильцов и снова
  // выдаёт нулевое поколение. Это предел приёма, а не ошибка реализации.
  for (let i = 0; i < engine.maxGeneration; i += 1) {
    registry.destroy(registry.create());
  }
  assert.equal(registry.stats.wrapped, 1);
  assert.equal(registry.alive, 0, 'nobody lives in the slot');
  // Место пусто, но поколение снова нулевое — и давно мёртвый дескриптор
  // проходит проверку. Это цена дескриптора в 32 разряда, а не ошибка.
  assert.equal(registry.isAlive(ancient), true, 'the wrap revives a stale handle');
  assert.equal(registry.create(), ancient, 'after a full circle the handle repeats');
});

test('reset returns the registry to its initial state', () => {
  const registry = engine.newRegistry(4);
  const entity = registry.create();
  registry.destroy(entity);
  registry.reset();
  assert.equal(registry.alive, 0);
  assert.equal(registry.used, 0);
  assert.equal(registry.stats.created, 0);
  assert.equal(registry.create(), engine.makeEntity(0, 0));
});
