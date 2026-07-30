// Слой 3: часы движка — пауза, масштаб времени, ручной шаг.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

test('game time follows real time while the clock runs', () => {
  const clock = engine.newClock();
  engine.tickClock(clock, 16);
  engine.tickClock(clock, 17);
  assert.equal(clock.realMs, 33);
  assert.equal(clock.gameMs, 33);
});

test('a paused clock freezes game time but not real time', () => {
  const clock = engine.newClock();
  engine.tickClock(clock, 16);
  clock.paused = true;
  const delta = engine.tickClock(clock, 16);
  assert.equal(delta, 0);
  assert.equal(clock.gameMs, 16);
  assert.equal(clock.realMs, 32);
});

test('time scale slows down the game timeline', () => {
  const clock = engine.newClock();
  clock.timeScale = 0.25;
  engine.tickClock(clock, 40);
  assert.equal(clock.gameMs, 10);
  assert.equal(clock.realMs, 40);
});

test('single-stepping a paused clock advances game time by exactly one step', () => {
  const clock = engine.newClock();
  clock.paused = true;
  engine.tickClock(clock, 16);
  engine.stepClockOnce(clock, engine.fixedStepMs);
  assert.equal(clock.gameMs, engine.fixedStepMs);
  assert.equal(clock.realMs, 16);
});

test('negative real time does not move the clock backwards', () => {
  const clock = engine.newClock();
  engine.tickClock(clock, -50);
  assert.equal(clock.realMs, 0);
  assert.equal(clock.gameMs, 0);
});
