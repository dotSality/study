// Адаптер соответствия. Стенд знает только имена из этого файла.
// Своё API вы называете как хотите — правится адаптер, тесты не трогаются.
import { resolveDrawingBuffer, MAX_PIXEL_RATIO } from '../src/engine/viewport.ts';

export const engine = {
  maxPixelRatio: MAX_PIXEL_RATIO,

  // Контракт стенда: (ширина, высота, плотность[, потолок]) →
  // { width, height, pixelRatio, pixels }.
  drawingBuffer(cssWidth, cssHeight, devicePixelRatio, maxPixelRatio = MAX_PIXEL_RATIO) {
    return resolveDrawingBuffer({ cssWidth, cssHeight, devicePixelRatio }, maxPixelRatio);
  },
};
