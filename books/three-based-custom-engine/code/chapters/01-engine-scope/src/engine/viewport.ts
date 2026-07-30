// Размер картинки, которую движок просит у браузера.
// В модуле нет ни DOM, ни three.js: поэтому его проверяет слой 3 — без браузера.

/** Что сообщает страница: размер холста в CSS-пикселях и плотность экрана. */
export interface ViewportRequest {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
}

/** Что получает рендерер: размер буфера рисования в физических пикселях. */
export interface DrawingBuffer {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly pixels: number;
}

/** Потолок плотности: выше него растёт только счёт за пиксели (решение Р1.1). */
export const MAX_PIXEL_RATIO = 2;

export function resolveDrawingBuffer(
  request: ViewportRequest,
  maxPixelRatio: number = MAX_PIXEL_RATIO,
): DrawingBuffer {
  const pixelRatio = Math.min(request.devicePixelRatio, maxPixelRatio);
  const width = Math.floor(request.cssWidth * pixelRatio);
  const height = Math.floor(request.cssHeight * pixelRatio);
  return { width, height, pixelRatio, pixels: width * height };
}
