// Источник кадров: откуда цикл узнаёт, что пора считать следующий кадр.
// Отдельная сущность нужна не для красоты: браузерный источник недетерминирован,
// а проверяемость требует кадра как функции своего номера (глава 1, §1.3.2).

export interface FrameSource {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

/** Браузерный источник: кадры выдаёт requestAnimationFrame. */
export function createRafSource(target: Window): FrameSource {
  return {
    request: (callback) => target.requestAnimationFrame(callback),
    cancel: (handle) => target.cancelAnimationFrame(handle),
  };
}

/** Ручной источник: кадры выдаёт тест или стенд, время задаётся явно. */
export interface ManualSource extends FrameSource {
  /** Выдать один кадр с указанной отметкой времени. */
  frame(nowMs: number): void;
  /** Выдать несколько кадров подряд с постоянным шагом времени. */
  frames(count: number, stepMs: number): void;
  /** Текущая отметка времени источника, мс. */
  readonly nowMs: number;
  /** Ждёт ли источник следующего кадра. */
  readonly pending: boolean;
}

export function createManualSource(startMs: number = 0): ManualSource {
  let callback: ((nowMs: number) => void) | null = null;
  let handle = 0;
  let now = startMs;

  const source: ManualSource = {
    request(next) {
      callback = next;
      handle += 1;
      return handle;
    },

    cancel() {
      callback = null;
    },

    frame(nowMs) {
      now = nowMs;
      const pending = callback;
      callback = null;
      if (pending !== null) pending(now);
    },

    frames(count, stepMs) {
      for (let i = 0; i < count; i += 1) {
        source.frame(now + stepMs);
      }
    },

    get nowMs() {
      return now;
    },

    get pending() {
      return callback !== null;
    },
  };

  return source;
}
