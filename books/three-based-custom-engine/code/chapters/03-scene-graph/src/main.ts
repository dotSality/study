// Глава 3: граф сцены. Иерархия «солнце — планета — луна» вращается фиксированным
// шагом; преобразованиями владеет движок, three получает готовые мировые матрицы
// и не обходит свой граф вовсе.
import * as THREE from 'three';
import { resolveDrawingBuffer } from './engine/viewport.ts';
import { createScheduler } from './engine/scheduler.ts';
import type { FrameInfo } from './engine/scheduler.ts';
import { createLoop } from './engine/loop.ts';
import { createRafSource } from './engine/frame-source.ts';
import { FIXED_STEP_MS } from './engine/fixed-step.ts';
import {
  addChild,
  countNodes,
  createSceneGraph,
  createSceneNode,
  setLocalPosition,
  setLocalRotation,
  setLocalScale,
} from './engine/scene-graph.ts';
import { createCamera, clipToNdc, ndcToScreen, worldToClip } from './engine/camera.ts';
import { fromAxisAngle } from './engine/rotation.ts';
import { readOrigin } from './engine/math.ts';

const CSS_WIDTH = 640;
const CSS_HEIGHT = 360;
const CLEAR_COLOR = 0x101820;
const SUN_COLOR = 0xffc040;
const PLANET_COLOR = 0x4080ff;
const MOON_COLOR = 0xc0c0c0;

const ORBIT_RADIUS = 3;
const MOON_RADIUS = 1;
/** Пол-оборота в секунду для планеты, вдвое быстрее — для луны. */
const PLANET_RADIANS_PER_STEP = (Math.PI * FIXED_STEP_MS) / 1000;
const MOON_RADIANS_PER_STEP = PLANET_RADIANS_PER_STEP * 2;

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
// Граф three не обходится: мировые матрицы приходят готовыми из графа движка.
scene.matrixWorldAutoUpdate = false;

// --- граф движка -----------------------------------------------------------

// Масштаб узла достаётся всем его потомкам, поэтому точка привязки и меш —
// разные узлы: иначе размер планеты растянул бы орбиту её луны.
const world = createSceneNode('world');
const sunMesh = createSceneNode('sun-mesh');
const planetOrbit = createSceneNode('planet-orbit');
const planetPivot = createSceneNode('planet-pivot');
const planetMesh = createSceneNode('planet-mesh');
const moonOrbit = createSceneNode('moon-orbit');
const moonPivot = createSceneNode('moon-pivot');
const moonMesh = createSceneNode('moon-mesh');
const cameraRig = createSceneNode('camera-rig');
const cameraNode = createSceneNode('camera');

addChild(world, sunMesh);
addChild(world, planetOrbit);
addChild(planetOrbit, planetPivot);
addChild(planetPivot, planetMesh);
addChild(planetPivot, moonOrbit);
addChild(moonOrbit, moonPivot);
addChild(moonPivot, moonMesh);
addChild(world, cameraRig);
addChild(cameraRig, cameraNode);

setLocalScale(sunMesh, 0.8, 0.8, 0.8);
setLocalPosition(planetPivot, ORBIT_RADIUS, 0, 0);
setLocalScale(planetMesh, 0.4, 0.4, 0.4);
setLocalPosition(moonPivot, MOON_RADIUS, 0, 0);
setLocalScale(moonMesh, 0.25, 0.25, 0.25);
setLocalPosition(cameraNode, 0, 3, 9);

const graph = createSceneGraph(world);
const camera = createCamera(cameraNode);
camera.setPerspective(Math.PI / 3, CSS_WIDTH / CSS_HEIGHT, 0.1, 100);

// Камера смотрит немного сверху вниз, на начало координат.
const tilt = new THREE.Quaternion();
fromAxisAngle(1, 0, 0, -Math.atan2(3, 9), tilt);
setLocalRotation(cameraNode, tilt);

// --- отрисовка через three --------------------------------------------------

const geometry = new THREE.SphereGeometry(1, 16, 12);

function createBody(color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, wireframe: true }));
  // Матрицы приходят из движка, поэтому three их не считает и не обходит граф.
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}

const bodies = [
  { node: sunMesh, mesh: createBody(SUN_COLOR) },
  { node: planetMesh, mesh: createBody(PLANET_COLOR) },
  { node: moonMesh, mesh: createBody(MOON_COLOR) },
];

const renderCamera = new THREE.PerspectiveCamera();
renderCamera.matrixAutoUpdate = false;
renderCamera.matrixWorldAutoUpdate = false;

// --- симуляция --------------------------------------------------------------

const spin = { planetPrevious: 0, planetCurrent: 0, moonPrevious: 0, moonCurrent: 0 };
const orbitRotation = new THREE.Quaternion();
const scheduler = createScheduler();

scheduler.add({
  name: 'orbits',
  phase: 'fixed',
  update() {
    spin.planetPrevious = spin.planetCurrent;
    spin.moonPrevious = spin.moonCurrent;
    spin.planetCurrent += PLANET_RADIANS_PER_STEP;
    spin.moonCurrent += MOON_RADIANS_PER_STEP;
  },
});

scheduler.add({
  name: 'graph',
  phase: 'update',
  update(frame: FrameInfo) {
    const planetAngle =
      spin.planetPrevious + (spin.planetCurrent - spin.planetPrevious) * frame.alpha;
    const moonAngle = spin.moonPrevious + (spin.moonCurrent - spin.moonPrevious) * frame.alpha;

    // Двигаются только два узла орбит — остальные едут за ними по иерархии.
    fromAxisAngle(0, 1, 0, planetAngle, orbitRotation);
    setLocalRotation(planetOrbit, orbitRotation);
    fromAxisAngle(0, 1, 0, moonAngle, orbitRotation);
    setLocalRotation(moonOrbit, orbitRotation);

    graph.update();
    camera.update();
  },
});

scheduler.add({
  name: 'render',
  phase: 'render',
  update() {
    for (let i = 0; i < bodies.length; i += 1) {
      bodies[i].mesh.matrixWorld.copy(bodies[i].node.worldMatrix);
    }
    renderCamera.matrixWorld.copy(cameraNode.worldMatrix);
    renderCamera.matrixWorldInverse.copy(camera.viewMatrix);
    renderCamera.projectionMatrix.copy(camera.projectionMatrix);
    renderCamera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.render(scene, renderCamera);
  },
});

const loop = createLoop({ source: createRafSource(window), scheduler });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetTime();
});

const standDriven = new URLSearchParams(window.location.search).has('stand');
if (!standDriven) loop.start();

const centerPixel = new Uint8Array(4);
const scratchVector = new THREE.Vector3();
const scratchClip = new THREE.Vector4();
const scratchNdc = new THREE.Vector3();

function worldPosition(node: typeof world): number[] {
  readOrigin(node.worldMatrix, scratchVector);
  return [scratchVector.x, scratchVector.y, scratchVector.z];
}

function screenPosition(node: typeof world): number[] {
  readOrigin(node.worldMatrix, scratchVector);
  worldToClip(camera, scratchVector, scratchClip);
  clipToNdc(scratchClip, scratchNdc);
  ndcToScreen(scratchNdc, CSS_WIDTH, CSS_HEIGHT, scratchVector);
  return [scratchVector.x, scratchVector.y, scratchVector.z];
}

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
    frames: loop.frame,
    steps: loop.steps,
    alpha: loop.fixedStep.alpha,
    gameMs: loop.clock.gameMs,
    nodes: countNodes(world),
    graph: {
      traversals: graph.stats.traversals,
      visited: graph.stats.visited,
      localRecomputed: graph.stats.localRecomputed,
      worldRecomputed: graph.stats.worldRecomputed,
    },
    // Ни у сцены, ни у мешей three не обходит и не пересчитывает матрицы:
    // они приходят готовыми из графа движка.
    threeAutoUpdate: {
      scene: scene.matrixWorldAutoUpdate,
      mesh: bodies[0].mesh.matrixAutoUpdate,
      meshWorld: bodies[0].mesh.matrixWorldAutoUpdate,
    },
    worldPositions: {
      sun: worldPosition(sunMesh),
      planet: worldPosition(planetPivot),
      moon: worldPosition(moonPivot),
    },
    screenPositions: {
      sun: screenPosition(sunMesh),
      planet: screenPosition(planetPivot),
      moon: screenPosition(moonPivot),
    },
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

  /**
   * Прогон виртуальным временем: кадры выдаёт стенд, а не браузер.
   * Состояние симуляции сбрасывается вместе с часами — иначе второй прогон
   * продолжил бы первый и кадр перестал бы быть функцией своего номера.
   */
  runVirtual(frames: number, stepMs: number) {
    loop.stop();
    loop.resetTime();
    spin.planetPrevious = 0;
    spin.planetCurrent = 0;
    spin.moonPrevious = 0;
    spin.moonCurrent = 0;
    graph.resetStats();
    for (let i = 1; i <= frames; i += 1) {
      loop.tick(i * stepMs);
    }
    return readReport();
  },

  resetGraphStats() {
    graph.resetStats();
  },

  start() {
    loop.start();
  },

  stop() {
    loop.stop();
  },
};
