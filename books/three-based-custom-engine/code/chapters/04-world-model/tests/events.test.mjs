// Слой 3: очередь событий. Проверяется порядок доставки, отложенная доставка
// и то, что событие, отправленное из обработчика, не зацикливает доставку.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

const DAMAGE = 1;
const DIED = 2;

function collector(queue, type) {
  const seen = [];
  queue.subscribe(type, (event) => {
    seen.push([event.target, event.a, event.sequence]);
  });
  return seen;
}

test('a posted event reaches its subscriber on the next dispatch', () => {
  const queue = engine.newEventQueue(8);
  const seen = collector(queue, DAMAGE);
  assert.equal(queue.post(DAMAGE, 42, 7), true);
  assert.equal(seen.length, 0, 'posting does not call anybody');
  assert.equal(queue.dispatch(0), 1);
  assert.deepEqual(seen, [[42, 7, 0]]);
  assert.equal(queue.stats.delivered, 1);
});

test('events with the same time and priority keep the order of posting', () => {
  const queue = engine.newEventQueue(8);
  const seen = collector(queue, DAMAGE);
  queue.post(DAMAGE, 1, 10);
  queue.post(DAMAGE, 2, 20);
  queue.post(DAMAGE, 3, 30);
  queue.dispatch(0);
  assert.deepEqual(
    seen.map((entry) => entry[1]),
    [10, 20, 30],
  );
});

test('a higher priority wins at the same delivery time', () => {
  const queue = engine.newEventQueue(8);
  const seen = collector(queue, DAMAGE);
  queue.post(DAMAGE, 1, 10, 0, 0, 0, 0);
  queue.post(DAMAGE, 2, 20, 0, 0, 0, 5);
  queue.post(DAMAGE, 3, 30, 0, 0, 0, 5);
  queue.dispatch(0);
  // Приоритет 5 обгоняет ноль, а внутри приоритета порядок отправки сохраняется.
  assert.deepEqual(
    seen.map((entry) => entry[1]),
    [20, 30, 10],
  );
});

test('an event dated into the future waits for its time', () => {
  const queue = engine.newEventQueue(8);
  const seen = collector(queue, DAMAGE);
  queue.post(DAMAGE, 1, 10, 0, 0, 500);
  assert.equal(queue.dispatch(0), 0);
  assert.equal(queue.size, 1);
  assert.equal(queue.nextDeliveryMs(), 500);
  assert.equal(queue.dispatch(499), 0);
  assert.equal(queue.dispatch(500), 1);
  assert.equal(seen.length, 1);
});

test('a dispatch delivers everything due and leaves the rest', () => {
  const queue = engine.newEventQueue(8);
  const seen = collector(queue, DAMAGE);
  queue.post(DAMAGE, 1, 1, 0, 0, 0);
  queue.post(DAMAGE, 2, 2, 0, 0, 100);
  queue.post(DAMAGE, 3, 3, 0, 0, 200);
  assert.equal(queue.dispatch(100), 2);
  assert.equal(queue.size, 1);
  assert.deepEqual(
    seen.map((entry) => entry[1]),
    [1, 2],
  );
});

test('an event posted from a handler waits for the next dispatch', () => {
  const queue = engine.newEventQueue(8);
  const order = [];
  queue.subscribe(DAMAGE, (event) => {
    order.push(`damage:${event.a}`);
    // Обработчик отправляет событие себе же: без границы партии это
    // крутилось бы внутри одного dispatch до исчерпания очереди.
    if (event.a > 0) queue.post(DAMAGE, event.target, event.a - 1);
  });
  queue.post(DAMAGE, 1, 2);
  assert.equal(queue.dispatch(0), 1);
  assert.deepEqual(order, ['damage:2']);
  assert.equal(queue.stats.deferred, 1);
  assert.equal(queue.dispatch(0), 1);
  assert.deepEqual(order, ['damage:2', 'damage:1']);
  assert.equal(queue.dispatch(0), 1);
  assert.equal(queue.dispatch(0), 0);
  assert.deepEqual(order, ['damage:2', 'damage:1', 'damage:0']);
});

test('a handler sees the queue as dispatching', () => {
  const queue = engine.newEventQueue(4);
  let insideDispatch = null;
  queue.subscribe(DIED, () => {
    insideDispatch = queue.dispatching;
  });
  queue.post(DIED);
  queue.dispatch(0);
  assert.equal(insideDispatch, true);
  assert.equal(queue.dispatching, false);
});

test('unsubscribing stops the delivery', () => {
  const queue = engine.newEventQueue(4);
  let calls = 0;
  const unsubscribe = queue.subscribe(DIED, () => {
    calls += 1;
  });
  queue.post(DIED);
  queue.dispatch(0);
  unsubscribe();
  assert.equal(queue.listeners(DIED), 0);
  queue.post(DIED);
  queue.dispatch(0);
  assert.equal(calls, 1);
  assert.equal(queue.stats.unheard, 1);
});

test('an event nobody listens to is counted, not kept', () => {
  const queue = engine.newEventQueue(4);
  queue.post(DIED);
  assert.equal(queue.dispatch(0), 1);
  assert.equal(queue.stats.unheard, 1);
  assert.equal(queue.size, 0);
});

test('a full queue refuses the event and counts it', () => {
  const queue = engine.newEventQueue(2);
  assert.equal(queue.post(DAMAGE), true);
  assert.equal(queue.post(DAMAGE), true);
  assert.equal(queue.post(DAMAGE), false);
  assert.equal(queue.stats.dropped, 1);
  assert.equal(queue.stats.peak, 2);
});

test('delivered slots go back to the stock', () => {
  const queue = engine.newEventQueue(2);
  collector(queue, DAMAGE);
  for (let round = 0; round < 500; round += 1) {
    assert.equal(queue.post(DAMAGE, round), true);
    assert.equal(queue.post(DAMAGE, round), true);
    assert.equal(queue.dispatch(0), 2);
  }
  assert.equal(queue.stats.dropped, 0);
  assert.equal(queue.stats.delivered, 1000);
});

test('the event object handed to a handler comes from the stock', () => {
  const queue = engine.newEventQueue(2);
  const objects = new Set();
  queue.subscribe(DAMAGE, (event) => {
    objects.add(event);
  });
  for (let i = 0; i < 100; i += 1) {
    queue.post(DAMAGE, i);
    queue.dispatch(0);
  }
  // Сто доставок — не более двух объектов: ровно столько создано при сборке.
  assert.ok(objects.size <= 2, `expected at most 2 distinct objects, got ${objects.size}`);
});

test('clear drops the queue and gives the slots back', () => {
  const queue = engine.newEventQueue(2);
  queue.post(DAMAGE);
  queue.post(DAMAGE);
  queue.clear();
  assert.equal(queue.size, 0);
  assert.equal(queue.post(DAMAGE), true);
});

test('two runs of the same script deliver in the same order', () => {
  function run() {
    const queue = engine.newEventQueue(8);
    const seen = [];
    queue.subscribe(DAMAGE, (event) => seen.push(`d${event.a}`));
    queue.subscribe(DIED, (event) => seen.push(`x${event.a}`));
    queue.post(DAMAGE, 1, 1, 0, 0, 20);
    queue.post(DIED, 1, 2, 0, 0, 10, 3);
    queue.post(DAMAGE, 2, 3, 0, 0, 10);
    queue.post(DIED, 2, 4, 0, 0, 10, 3);
    queue.dispatch(50);
    return seen;
  }
  const first = run();
  assert.deepEqual(first, ['x2', 'x4', 'd3', 'd1']);
  assert.deepEqual(run(), first);
});
