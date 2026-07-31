// Первый кадр: пустая сцена, заданный размер холста, отчёт для стенда.
import * as THREE from 'three';
import { resolveDrawingBuffer } from './engine/viewport.ts';

const CSS_WIDTH = 640;
const CSS_HEIGHT = 360;
const CLEAR_COLOR = 0x101820;

const canvas = document.getElementById('view');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('canvas #view not found');
}

const requested = resolveDrawingBuffer({
  cssWidth: CSS_WIDTH,
  cssHeight: CSS_HEIGHT,
  devicePixelRatio: window.devicePixelRatio,
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(requested.pixelRatio);
renderer.setSize(CSS_WIDTH, CSS_HEIGHT);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CLEAR_COLOR);

const camera = new THREE.PerspectiveCamera(60, CSS_WIDTH / CSS_HEIGHT, 0.1, 100);
camera.position.set(0, 0, 5);

renderer.render(scene, camera);

// Отчёт для стенда: ровно те величины, которые сценарий слоя 2 проверяет ассертами.
const gl = renderer.getContext();
const centerPixel = new Uint8Array(4);
gl.readPixels(
  Math.floor(requested.width / 2),
  Math.floor(requested.height / 2),
  1,
  1,
  gl.RGBA,
  gl.UNSIGNED_BYTE,
  centerPixel,
);

const actualSize = new THREE.Vector2();
renderer.getDrawingBufferSize(actualSize);
const cssSize = new THREE.Vector2();
renderer.getSize(cssSize);

declare global {
  interface Window {
    standReport?: unknown;
  }
}

window.standReport = {
  three: THREE.REVISION,
  webgl2: gl instanceof WebGL2RenderingContext,
  crossOriginIsolated: window.crossOriginIsolated,
  requested,
  actual: { width: actualSize.x, height: actualSize.y },
  cssSize: { width: cssSize.x, height: cssSize.y },
  info: {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    frame: renderer.info.render.frame,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  },
  centerPixel: [...centerPixel],
};
