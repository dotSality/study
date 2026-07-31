// Слой 3: пул объектов. Проверяется не скорость, а отсутствие новых объектов.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

function vectorPool(capacity) {
  let created = 0;
  const pool = engine.newPool(
    () => {
      created += 1;
      return { x: 0, y: 0, z: 0 };
    },
    (vector) => {
      vector.x = 0;
      vector.y = 0;
      vector.z = 0;
    },
    capacity,
  );
  return { pool, createdCount: () => created };
}

test('a pool creates all of its objects up front', () => {
  const { pool, createdCount } = vectorPool(8);
  assert.equal(createdCount(), 8);
  assert.equal(pool.free, 8);
  assert.equal(pool.used, 0);
});

test('a released object is handed out again instead of a new one', () => {
  const { pool, createdCount } = vectorPool(2);
  const first = pool.acquire();
  pool.release(first);
  const second = pool.acquire();
  assert.equal(first, second);
  assert.equal(createdCount(), 2);
});

test('release resets the object before it is reused', () => {
  const { pool } = vectorPool(1);
  const vector = pool.acquire();
  vector.x = 42;
  pool.release(vector);
  const again = pool.acquire();
  assert.deepEqual(again, { x: 0, y: 0, z: 0 });
});

test('an exhausted pool refuses instead of growing', () => {
  const { pool, createdCount } = vectorPool(1);
  pool.acquire();
  assert.throws(() => pool.acquire(), RangeError);
  assert.equal(createdCount(), 1);
  assert.equal(pool.denied, 1);
});

test('tryAcquire returns null on an empty pool', () => {
  const { pool } = vectorPool(1);
  pool.acquire();
  assert.equal(pool.tryAcquire(), null);
});

test('a thousand acquire-release cycles create nothing new', () => {
  const { pool, createdCount } = vectorPool(4);
  for (let i = 0; i < 1000; i += 1) {
    const a = pool.acquire();
    const b = pool.acquire();
    a.x = i;
    b.y = i;
    pool.release(a);
    pool.release(b);
  }
  assert.equal(createdCount(), 4);
  assert.equal(pool.free, 4);
  assert.equal(pool.denied, 0);
});
