// Часы движка: перевод реального времени в игровое.
// Пауза, замедление и ручной шаг живут здесь, и цикл кадра о них ничего не знает.

export interface EngineClock {
  /** На паузе игровое время стоит, реальное продолжает идти. */
  paused: boolean;
  /** Масштаб игрового времени: 1 — как реальное, 0,25 — замедление вчетверо. */
  timeScale: number;
  /** Реальное время с запуска, мс. */
  realMs: number;
  /** Игровое время с запуска, мс. */
  gameMs: number;
  /** Реальная длительность последнего кадра, мс. */
  frameRealMs: number;
  /** Игровая длительность последнего кадра, мс. */
  frameGameMs: number;
}

export function createClock(): EngineClock {
  return {
    paused: false,
    timeScale: 1,
    realMs: 0,
    gameMs: 0,
    frameRealMs: 0,
    frameGameMs: 0,
  };
}

/** Продвигает часы на реальную дельту кадра и возвращает игровую дельту. */
export function tickClock(clock: EngineClock, realDeltaMs: number): number {
  const real = Math.max(0, realDeltaMs);
  clock.frameRealMs = real;
  clock.realMs += real;
  clock.frameGameMs = clock.paused ? 0 : real * clock.timeScale;
  clock.gameMs += clock.frameGameMs;
  return clock.frameGameMs;
}

/**
 * Вернуть часы в состояние «движок только что собрали»: обнуляются оба времени
 * и обе дельты, пауза снимается, масштаб возвращается к единице. Понадобилось
 * при сборке ядра (часть 5.1): прогон, начинающийся с ненулевого времени,
 * перестаёт быть функцией номера кадра.
 */
export function resetClock(clock: EngineClock): void {
  clock.paused = false;
  clock.timeScale = 1;
  clock.realMs = 0;
  clock.gameMs = 0;
  clock.frameRealMs = 0;
  clock.frameGameMs = 0;
}

/**
 * Ручной шаг на паузе: игровое время двигается ровно на один шаг, реальное — нет.
 * Отладочный приём — покадровый просмотр при живом рендере (часть 2.3).
 */
export function stepClockOnce(clock: EngineClock, stepMs: number): number {
  clock.frameGameMs = stepMs;
  clock.gameMs += stepMs;
  return stepMs;
}
