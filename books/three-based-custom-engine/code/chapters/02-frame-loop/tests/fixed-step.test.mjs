// Слой 3: арифметика фиксированного шага. Ни браузера, ни времени — только числа.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

const STEP = engine.fixedStepMs;

test('a frame shorter than one step produces no steps and keeps the remainder', () => {
  const state = engine.newFixedStep();
  engine.advance(state, 10);
  assert.equal(state.steps, 0);
  assert.equal(state.accumulator, 10);
});

test('a frame of exactly one step produces one step and no remainder', () => {
  const state = engine.newFixedStep();
  engine.advance(state, STEP);
  assert.equal(state.steps, 1);
  assert.ok(Math.abs(state.accumulator) < 1e-9);
  assert.ok(Math.abs(state.alpha) < 1e-9);
});

test('alpha reports the leftover fraction of a step', () => {
  const state = engine.newFixedStep();
  engine.advance(state, STEP * 1.5);
  assert.equal(state.steps, 1);
  assert.ok(Math.abs(state.alpha - 0.5) < 1e-9);
});

test('two steps are consumed when the frame is twice the step', () => {
  const state = engine.newFixedStep();
  engine.advance(state, STEP * 2);
  assert.equal(state.steps, 2);
});

test('a long frame is clamped by the frame ceiling', () => {
  const config = { stepMs: STEP, maxFrameMs: 250, maxStepsPerFrame: 100 };
  const state = engine.newFixedStep();
  engine.advance(state, 5000, config);
  assert.equal(state.droppedMs, 4750);
  assert.equal(state.steps, 15); // 250 мс / 16,666… мс
});

test('the number of steps per frame is capped', () => {
  const config = { stepMs: STEP, maxFrameMs: 1000, maxStepsPerFrame: 5 };
  const state = engine.newFixedStep();
  engine.advance(state, 1000, config);
  assert.equal(state.steps, 5);
});

test('the debt above one step is dropped instead of carried into the next frame', () => {
  const config = { stepMs: STEP, maxFrameMs: 1000, maxStepsPerFrame: 5 };
  const state = engine.newFixedStep();
  engine.advance(state, 1000, config);
  assert.ok(state.accumulator < config.stepMs);
  assert.ok(state.droppedMs > 900);

  // Следующий обычный кадр снова даёт ровно один шаг: долга не осталось.
  engine.advance(state, STEP, config);
  assert.equal(state.steps, 1);
});

test('negative frame time advances nothing', () => {
  const state = engine.newFixedStep();
  engine.advance(state, -100);
  assert.equal(state.steps, 0);
  assert.equal(state.accumulator, 0);
});

test('sixty frames of one step each produce exactly sixty steps', () => {
  const state = engine.newFixedStep();
  let steps = 0;
  for (let i = 0; i < 60; i += 1) {
    engine.advance(state, STEP);
    steps += state.steps;
  }
  assert.equal(steps, 60);
});

test('frames of 20 ms keep the simulation on its own grid', () => {
  const state = engine.newFixedStep();
  let steps = 0;
  for (let i = 0; i < 59; i += 1) {
    engine.advance(state, 20);
    steps += state.steps;
  }
  // 59 кадров по 20 мс = 1180 мс = 70 шагов по 16,666… мс и 13,33 мс в остатке.
  assert.equal(steps, 70);
  assert.ok(Math.abs(state.alpha - 0.8) < 1e-9);
});
