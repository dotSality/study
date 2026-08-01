// Слой 3: порядок фаз и порядок подсистем внутри фазы.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

const FRAME = { frame: 1, phase: 'update', deltaMs: 16, alpha: 0, gameMs: 16 };

function recorder(log, name, phase, order) {
  return {
    name,
    phase,
    order,
    update() {
      log.push(name);
    },
  };
}

test('the phase order is input, fixed, update, render', () => {
  assert.deepEqual([...engine.phases], ['input', 'fixed', 'update', 'render']);
});

test('systems of one phase run in registration order', () => {
  const log = [];
  const scheduler = engine.newScheduler();
  scheduler.add(recorder(log, 'first', 'update'));
  scheduler.add(recorder(log, 'second', 'update'));
  scheduler.add(recorder(log, 'third', 'update'));
  scheduler.run('update', FRAME);
  assert.deepEqual(log, ['first', 'second', 'third']);
});

test('a smaller order value runs earlier', () => {
  const log = [];
  const scheduler = engine.newScheduler();
  scheduler.add(recorder(log, 'late', 'update', 10));
  scheduler.add(recorder(log, 'early', 'update', -10));
  scheduler.add(recorder(log, 'default', 'update'));
  scheduler.run('update', FRAME);
  assert.deepEqual(log, ['early', 'default', 'late']);
});

test('a system registered in another phase is not called', () => {
  const log = [];
  const scheduler = engine.newScheduler();
  scheduler.add(recorder(log, 'physics', 'fixed'));
  scheduler.run('update', FRAME);
  assert.deepEqual(log, []);
  scheduler.run('fixed', FRAME);
  assert.deepEqual(log, ['physics']);
});

test('a removed system stops receiving frames', () => {
  const log = [];
  const scheduler = engine.newScheduler();
  scheduler.add(recorder(log, 'temporary', 'update'));
  scheduler.run('update', FRAME);
  assert.equal(scheduler.remove('temporary'), true);
  scheduler.run('update', FRAME);
  assert.deepEqual(log, ['temporary']);
  assert.equal(scheduler.remove('temporary'), false);
});
