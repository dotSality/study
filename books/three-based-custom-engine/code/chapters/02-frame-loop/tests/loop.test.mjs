// Слой 3: цикл кадра целиком, но без браузера — кадры выдаёт ручной источник.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

const STEP = engine.fixedStepMs;

function counting(phase, log) {
  return {
    name: `${phase}-counter`,
    phase,
    update(frame) {
      log.push(`${frame.frame}:${frame.phase}`);
    },
  };
}

function loopWithSource() {
  const source = engine.newManualSource(0);
  const scheduler = engine.newScheduler();
  const loop = engine.newLoop({ source, scheduler });
  return { source, scheduler, loop };
}

test('the first frame after start carries no time and no steps', () => {
  const { source, loop } = loopWithSource();
  loop.start();
  source.frame(1000);
  assert.equal(loop.frame, 1);
  assert.equal(loop.steps, 0);
  assert.equal(loop.clock.realMs, 0);
});

test('a manual source drives a deterministic number of fixed steps', () => {
  const { source, loop } = loopWithSource();
  loop.start();
  source.frames(61, STEP);
  assert.equal(loop.frame, 61);
  assert.equal(loop.steps, 60);
});

test('the render phase runs once per frame regardless of the number of steps', () => {
  const { source, scheduler, loop } = loopWithSource();
  const fixed = [];
  const render = [];
  scheduler.add(counting('fixed', fixed));
  scheduler.add(counting('render', render));
  loop.start();
  source.frame(0);
  source.frame(50); // 50 мс — это три шага симуляции
  assert.equal(fixed.length, 3);
  assert.equal(render.length, 2);
});

test('a stalled frame cannot multiply steps beyond the cap', () => {
  const source = engine.newManualSource(0);
  const scheduler = engine.newScheduler();
  const loop = engine.newLoop({
    source,
    scheduler,
    config: { stepMs: STEP, maxFrameMs: 250, maxStepsPerFrame: 5 },
  });
  loop.start();
  source.frame(0);
  source.frame(10_000); // десять секунд «зависания»
  assert.equal(loop.steps, 5);
  assert.ok(loop.fixedStep.droppedMs > 9000);
});

test('resetting time swallows the gap of a hidden tab', () => {
  const { source, loop } = loopWithSource();
  loop.start();
  source.frame(0);
  source.frame(STEP);
  assert.equal(loop.steps, 1);
  loop.resetTime();
  source.frame(60_000); // вкладка вернулась через минуту
  assert.equal(loop.steps, 1);
});

test('pausing the clock stops the simulation but not the frames', () => {
  const { source, loop } = loopWithSource();
  loop.start();
  source.frames(11, STEP);
  assert.equal(loop.steps, 10);
  loop.clock.paused = true;
  source.frames(10, STEP);
  assert.equal(loop.frame, 21);
  assert.equal(loop.steps, 10);
});

test('time scale changes how many steps a frame produces', () => {
  const { source, loop } = loopWithSource();
  loop.clock.timeScale = 2;
  loop.start();
  source.frames(11, STEP);
  assert.equal(loop.steps, 20);
});

test('stopping the loop stops the frames', () => {
  const { source, loop } = loopWithSource();
  loop.start();
  source.frames(3, STEP);
  loop.stop();
  assert.equal(source.pending, false);
  source.frames(5, STEP);
  assert.equal(loop.frame, 3);
});

test('systems receive the same frame object every frame', () => {
  const { source, scheduler, loop } = loopWithSource();
  const seen = new Set();
  scheduler.add({
    name: 'identity',
    phase: 'update',
    update(frame) {
      seen.add(frame);
    },
  });
  loop.start();
  source.frames(100, STEP);
  // Один объект на все сто кадров: значит, цикл не создаёт его заново (часть 2.4).
  assert.equal(seen.size, 1);
});
