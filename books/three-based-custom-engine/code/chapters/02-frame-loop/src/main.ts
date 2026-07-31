// Глава 2: цикл кадра. Куб вращается фиксированным шагом симуляции,
// отрисовка интерполирует между двумя последними шагами.
import * as THREE from 'three';
import { resolveDrawingBuffer } from './engine/viewport.ts';
import { createScheduler } from './engine/scheduler.ts';
import type { FrameInfo } from './engine/scheduler.ts';
import { createLoop } from './engine/loop.ts';
import { createRafSource } from './engine/frame-source.ts';
import { FIXED_STEP_MS } from './engine/fixed-step.ts';

const CSS_WIDTH = 640;
const CSS_HEIGHT = 360;
const CLEAR_COLOR = 0x101820;
const CUBE_COLOR = 0xff8040;
/** Пол-оборота в секунду, пересчитанные в угол одного шага симуляции. */
const RADIANS_PER_STEP = (Math.PI * FIXED_STEP_MS) / 1000;

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

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: CUBE_COLOR }),
);
scene.add(cube);

// Состояние симуляции: два снимка угла, между которыми интерполирует отрисовка.
const spin = { previous: 0, current: 0 };

const scheduler = createScheduler();

scheduler.add({
  name: 'spin',
  phase: 'fixed',
  update() {
    spin.previous = spin.current;
    spin.current += RADIANS_PER_STEP;
  },
});

scheduler.add({
  name: 'interpolate',
  phase: 'update',
  update(frame: FrameInfo) {
    cube.rotation.y = spin.previous + (spin.current - spin.previous) * frame.alpha;
  },
});

scheduler.add({
  name: 'render',
  phase: 'render',
  update() {
    renderer.render(scene, camera);
  },
});

const loop = createLoop({ source: createRafSource(window), scheduler });

// Скрытая вкладка кадров не получает. Когда она вернётся, отметка времени будет
// старой, и первый же кадр принесёт дельту в секунды — поэтому её забываем.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetTime();
});

// Стенд гоняет цикл сам, виртуальным временем: страница со «?stand» не запускает
// requestAnimationFrame, иначе прогон перестал бы быть воспроизводимым.
const standDriven = new URLSearchParams(window.location.search).has('stand');
if (!standDriven) loop.start();

const centerPixel = new Uint8Array(4);

function readReport() {
  const gl = renderer.getContext();
  gl.readPixels(
    Math.floor(requested.width / 2),
    Math.floor(requested.height / 2),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    centerPixel,
  );

  return {
    three: THREE.REVISION,
    crossOriginIsolated: window.crossOriginIsolated,
    frames: loop.frame,
    steps: loop.steps,
    alpha: loop.fixedStep.alpha,
    accumulator: loop.fixedStep.accumulator,
    droppedMs: loop.fixedStep.droppedMs,
    realMs: loop.clock.realMs,
    gameMs: loop.clock.gameMs,
    paused: loop.clock.paused,
    timeScale: loop.clock.timeScale,
    rotationY: cube.rotation.y,
    simulatedY: spin.current,
    info: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frame: renderer.info.render.frame,
      geometries: renderer.info.memory.geometries,
      programs: renderer.info.programs?.length ?? 0,
    },
    centerPixel: [...centerPixel],
  };
}

declare global {
  interface Window {
    stand?: unknown;
  }
}

window.stand = {
  report: readReport,

  /** Прогон виртуальным временем: кадры выдаёт стенд, а не браузер. */
  runVirtual(frames: number, stepMs: number) {
    loop.stop();
    loop.resetTime();
    for (let i = 1; i <= frames; i += 1) {
      loop.tick(i * stepMs);
    }
    return readReport();
  },

  setPaused(paused: boolean) {
    loop.clock.paused = paused;
  },

  setTimeScale(scale: number) {
    loop.clock.timeScale = scale;
  },

  start() {
    loop.start();
  },

  stop() {
    loop.stop();
  },
};
