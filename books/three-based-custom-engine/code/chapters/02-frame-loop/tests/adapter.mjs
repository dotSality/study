// Адаптер соответствия. Стенд знает только имена из этого файла.
// Своё API вы называете как хотите — правится адаптер, тесты не трогаются.
import { resolveDrawingBuffer, MAX_PIXEL_RATIO } from '../src/engine/viewport.ts';
import {
  advanceFixedStep,
  createFixedStep,
  DEFAULT_FIXED_STEP,
  FIXED_STEP_MS,
} from '../src/engine/fixed-step.ts';
import { createClock, stepClockOnce, tickClock } from '../src/engine/clock.ts';
import { createScheduler, PHASES } from '../src/engine/scheduler.ts';
import { createManualSource } from '../src/engine/frame-source.ts';
import { createLoop } from '../src/engine/loop.ts';
import { createPool } from '../src/engine/pool.ts';

export const engine = {
  // Глава 1
  maxPixelRatio: MAX_PIXEL_RATIO,
  drawingBuffer(cssWidth, cssHeight, devicePixelRatio, maxPixelRatio = MAX_PIXEL_RATIO) {
    return resolveDrawingBuffer({ cssWidth, cssHeight, devicePixelRatio }, maxPixelRatio);
  },

  // Глава 2: шаг симуляции
  fixedStepMs: FIXED_STEP_MS,
  defaultFixedStep: DEFAULT_FIXED_STEP,
  newFixedStep: () => createFixedStep(),
  advance: (state, frameMs, config = DEFAULT_FIXED_STEP) => advanceFixedStep(state, frameMs, config),

  // Глава 2: часы
  newClock: () => createClock(),
  tickClock: (clock, realDeltaMs) => tickClock(clock, realDeltaMs),
  stepClockOnce: (clock, stepMs) => stepClockOnce(clock, stepMs),

  // Глава 2: фазы и планировщик
  phases: PHASES,
  newScheduler: () => createScheduler(),

  // Глава 2: цикл и источник кадров
  newManualSource: (startMs = 0) => createManualSource(startMs),
  newLoop: (options) => createLoop(options),

  // Глава 2: пул
  newPool: (create, reset, capacity) => createPool(create, reset, capacity),
};
