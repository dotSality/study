// Слой 3: чистая логика движка, без браузера и без сборки.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './adapter.mjs';

test('pixel ratio 1: drawing buffer equals the CSS size', () => {
  const buffer = engine.drawingBuffer(640, 360, 1);
  assert.equal(buffer.width, 640);
  assert.equal(buffer.height, 360);
  assert.equal(buffer.pixelRatio, 1);
  assert.equal(buffer.pixels, 640 * 360);
});

test('pixel ratio 2: four times the pixels in the same window', () => {
  const one = engine.drawingBuffer(640, 360, 1);
  const two = engine.drawingBuffer(640, 360, 2);
  assert.equal(two.pixels, one.pixels * 4);
});

test('pixel ratio above the cap is clamped', () => {
  const buffer = engine.drawingBuffer(640, 360, 3);
  assert.equal(buffer.pixelRatio, engine.maxPixelRatio);
  assert.equal(buffer.width, 640 * engine.maxPixelRatio);
});

test('fractional pixel ratio still yields an integer buffer', () => {
  const buffer = engine.drawingBuffer(1024, 768, 1.5);
  assert.equal(buffer.width, 1536);
  assert.equal(buffer.height, 1152);
  assert.equal(buffer.pixels, 1536 * 1152);
});

test('the cap can be raised by the caller', () => {
  const buffer = engine.drawingBuffer(640, 360, 3, 3);
  assert.equal(buffer.pixelRatio, 3);
  assert.equal(buffer.width, 1920);
});
