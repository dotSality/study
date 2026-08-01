// Фиксированный шаг симуляции: сколько раз за кадр обновлять мир и что делать
// с остатком времени. Ни браузера, ни three.js — поэтому модуль проверяет слой 3.

/** Настройки шага: задаются один раз при сборке движка. */
export interface FixedStepConfig {
  /** Длительность одного шага симуляции, мс. */
  readonly stepMs: number;
  /** Потолок кадра: время сверх него симуляции не отдаётся. */
  readonly maxFrameMs: number;
  /** Потолок числа шагов за кадр — страховка от спирали смерти. */
  readonly maxStepsPerFrame: number;
}

/** Шестьдесят шагов в секунду: 16,666… мс. */
export const FIXED_STEP_MS = 1000 / 60;

/**
 * Допуск сравнения аккумулятора с шагом, мс. Время приходит в плавающей точке,
 * и дельта кадра оказывается на 10⁻¹⁵ мс меньше шага; без допуска этот
 * недобор копится в аккумуляторе и съедает по шагу на каждом прогоне
 * (поймано тестом: 61 кадр ровно по шагу давал 59 шагов вместо 60).
 */
const EPSILON_MS = 1e-9;

export const DEFAULT_FIXED_STEP: FixedStepConfig = {
  stepMs: FIXED_STEP_MS,
  maxFrameMs: 250,
  maxStepsPerFrame: 5,
};

/**
 * Состояние аккумулятора. Объект создаётся один раз и меняется на месте:
 * возвращать новый объект каждый кадр — аллокация в горячем цикле (часть 2.4).
 */
export interface FixedStepState {
  /** Не потраченное симуляцией время, мс. После кадра всегда меньше stepMs. */
  accumulator: number;
  /** Сколько шагов симуляции нужно сделать в этом кадре. */
  steps: number;
  /** Сколько времени кадра выброшено потолками, мс. */
  droppedMs: number;
  /** Доля шага, накопленная сверх последнего: для интерполяции, [0, 1). */
  alpha: number;
}

export function createFixedStep(): FixedStepState {
  return { accumulator: 0, steps: 0, droppedMs: 0, alpha: 0 };
}

export function advanceFixedStep(
  state: FixedStepState,
  frameMs: number,
  config: FixedStepConfig = DEFAULT_FIXED_STEP,
): void {
  // Время назад не идёт: отрицательная дельта означает сбитые часы, а не движение вспять.
  const elapsed = Math.max(0, frameMs);
  const taken = Math.min(elapsed, config.maxFrameMs);
  state.droppedMs = elapsed - taken;
  state.accumulator += taken;

  let steps = 0;
  while (state.accumulator + EPSILON_MS >= config.stepMs && steps < config.maxStepsPerFrame) {
    state.accumulator -= config.stepMs;
    steps += 1;
  }
  if (state.accumulator < 0) state.accumulator = 0;

  // Догнать не успели. Долг сверх одного шага выбрасываем: перенести его в
  // следующий кадр — значит начать следующий кадр с той же перегрузкой (часть 2.2).
  if (state.accumulator >= config.stepMs) {
    const debt = state.accumulator - (state.accumulator % config.stepMs);
    state.droppedMs += debt;
    state.accumulator -= debt;
  }

  state.steps = steps;
  state.alpha = state.accumulator / config.stepMs;
}
