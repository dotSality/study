// Глава 4: модель мира. Сущность — число, всё её содержимое лежит в хранилищах,
// а системы обходят хранилища подряд в своей фазе кадра. Граф сцены из главы 3
// остаётся ровно тем, чем был: местом, где хранятся преобразования.
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
import type { SceneNode } from './engine/scene-graph.ts';
import { createCamera } from './engine/camera.ts';
import { fromAxisAngle } from './engine/rotation.ts';
import { createWorld } from './engine/world.ts';
import { createComponentStore } from './engine/component-store.ts';
import { createVectorStore } from './engine/vector-store.ts';
import { createEventQueue } from './engine/events.ts';

const CSS_WIDTH = 640;
const CSS_HEIGHT = 360;
const CLEAR_COLOR = 0x101820;
const BODY_COLOR = 0x60c0ff;

/** Сколько сущностей помещается в мир. Ёмкость постоянная — как у пула. */
const CAPACITY = 32;
/** Сколько тел заводится при старте. */
const BODY_COUNT = 12;
/** Стенка, от которой отскакивают тела. */
const BOUND = 3;
/** Радиус, на котором тела расставлены при старте. */
const START_RADIUS = 2;
/** Скорость разбегания от центра, единиц в секунду. */
const OUTWARD_SPEED = 1.4;
/** Скорость вращения вокруг центра, единиц в секунду. */
const SPIN_SPEED = 1.5;
/** Здоровье нового тела. */
const START_HEALTH = 12;
/** Через сколько миллисекунд игрового времени доходит отложенный урон. */
const DELAYED_DAMAGE_MS = 100;

const EVENT_DAMAGE = 1;
const EVENT_DIED = 2;

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
scene.matrixWorldAutoUpdate = false;

// --- мир --------------------------------------------------------------------

const world = createWorld(CAPACITY);

const position = createVectorStore({
  name: 'position',
  capacity: CAPACITY,
  entityCapacity: CAPACITY,
});
const velocity = createVectorStore({
  name: 'velocity',
  capacity: CAPACITY,
  entityCapacity: CAPACITY,
});
const health = createComponentStore({
  name: 'health',
  capacity: CAPACITY,
  entityCapacity: CAPACITY,
  create: () => ({ current: 0, max: 0 }),
  reset: (value) => {
    value.current = START_HEALTH;
    value.max = START_HEALTH;
  },
});

world.addStore(position);
world.addStore(velocity);
world.addStore(health);

const events = createEventQueue(64);

// --- граф сцены и меши ------------------------------------------------------

// Узел и меш номер i обслуживают того, кто занимает место i в плотном массиве
// положений. Место меняет жильцов, узел остаётся на своей позиции в графе.
const root = createSceneNode('world');
const bodyNodes: SceneNode[] = [];
for (let i = 0; i < CAPACITY; i += 1) {
  const node = createSceneNode(`body-${i}`);
  setLocalScale(node, 0.3, 0.3, 0.3);
  addChild(root, node);
  bodyNodes.push(node);
}

const cameraRig = createSceneNode('camera-rig');
const cameraNode = createSceneNode('camera');
addChild(root, cameraRig);
addChild(cameraRig, cameraNode);
setLocalPosition(cameraNode, 0, 3, 11);

const graph = createSceneGraph(root);
const camera = createCamera(cameraNode);
camera.setPerspective(Math.PI / 3, CSS_WIDTH / CSS_HEIGHT, 0.1, 100);

const tilt = new THREE.Quaternion();
fromAxisAngle(1, 0, 0, -Math.atan2(3, 11), tilt);
setLocalRotation(cameraNode, tilt);

const geometry = new THREE.SphereGeometry(1, 12, 8);
const material = new THREE.MeshBasicMaterial({ color: BODY_COLOR, wireframe: true });
const meshes: THREE.Mesh[] = [];
for (let i = 0; i < CAPACITY; i += 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.visible = false;
  scene.add(mesh);
  meshes.push(mesh);
}

const renderCamera = new THREE.PerspectiveCamera();
renderCamera.matrixAutoUpdate = false;
renderCamera.matrixWorldAutoUpdate = false;

// --- заселение мира ---------------------------------------------------------

/** Тело номер i: место и скорость считаются от номера, без случайных чисел. */
function spawnBody(i: number): void {
  const entity = world.spawn();
  const angle = (i / BODY_COUNT) * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  position.add(entity, cos * START_RADIUS, sin * START_RADIUS, 0);
  // Скорость складывается из движения по кругу и от центра: тела расходятся
  // по спирали и рано или поздно доезжают до стенки.
  const vx = cos * OUTWARD_SPEED - sin * SPIN_SPEED;
  const vy = sin * OUTWARD_SPEED + cos * SPIN_SPEED;
  velocity.add(entity, vx, vy, 0);
  health.add(entity);
}

function populate(): void {
  for (let i = 0; i < BODY_COUNT; i += 1) {
    spawnBody(i);
  }
}

// --- системы ----------------------------------------------------------------

const scheduler = createScheduler();
const sim = { damageSent: 0, deaths: 0, bounces: 0 };
let step = 0;

// Движение: один проход по сплошным массивам. Ни одного обращения к сущности —
// системе достаточно того, что все занятые места лежат подряд.
scheduler.add({
  name: 'motion',
  phase: 'fixed',
  order: 0,
  update() {
    const dt = FIXED_STEP_MS / 1000;
    const size = position.size;
    for (let i = 0; i < size; i += 1) {
      const x = position.x[i] + velocity.x[i] * dt;
      const y = position.y[i] + velocity.y[i] * dt;
      if (x > BOUND || x < -BOUND) {
        velocity.x[i] = -velocity.x[i];
        sim.bounces += 1;
      } else {
        position.x[i] = x;
      }
      if (y > BOUND || y < -BOUND) {
        velocity.y[i] = -velocity.y[i];
        sim.bounces += 1;
      } else {
        position.y[i] = y;
      }
    }
  },
});

// Урон достаётся тому, кто дальше всех от центра. Кандидат ищется одним
// проходом по тем же сплошным массивам — это запрос к миру, а не к сущности.
scheduler.add({
  name: 'damage',
  phase: 'fixed',
  order: 1,
  update(frame: FrameInfo) {
    step += 1;
    if (position.size === 0) return;
    let victimSlot = 0;
    let farthest = -1;
    for (let i = 0; i < position.size; i += 1) {
      const distance = position.x[i] * position.x[i] + position.y[i] * position.y[i];
      if (distance > farthest) {
        farthest = distance;
        victimSlot = i;
      }
    }
    const victim = position.owners[victimSlot];
    events.post(EVENT_DAMAGE, victim, 1, 0, 0, frame.gameMs);
    sim.damageSent += 1;
    if (step % 5 === 0) {
      // Событие в будущее: доедет через DELAYED_DAMAGE_MS игрового времени.
      events.post(EVENT_DAMAGE, victim, 1, 0, 0, frame.gameMs + DELAYED_DAMAGE_MS);
      sim.damageSent += 1;
    }
  },
});

// Доставка идёт после систем, которые события порождают, и до удаления:
// так обработчик успевает поставить сущность в очередь на вылет.
scheduler.add({
  name: 'events',
  phase: 'fixed',
  order: 2,
  update(frame: FrameInfo) {
    events.dispatch(frame.gameMs);
  },
});

scheduler.add({
  name: 'reaper',
  phase: 'fixed',
  order: 3,
  update() {
    world.flush();
  },
});

events.subscribe(EVENT_DAMAGE, (event) => {
  const hp = health.get(event.target);
  // Цель могла умереть между отправкой и доставкой: событие живёт дольше,
  // чем то состояние мира, на которое оно рассчитывалось. Здоровье в нуле —
  // сущность уже приговорена и ждёт уборки, второй раз её не убивают.
  if (hp === null || hp.current <= 0) return;
  hp.current -= event.a;
  if (hp.current <= 0) {
    events.post(EVENT_DIED, event.target);
  }
});

events.subscribe(EVENT_DIED, (event) => {
  if (world.despawn(event.target)) {
    sim.deaths += 1;
  }
});

// Синхронизация: мир отдаёт графу сцены положения живых тел, и только их.
scheduler.add({
  name: 'sync',
  phase: 'update',
  update() {
    const size = position.size;
    for (let i = 0; i < size; i += 1) {
      setLocalPosition(bodyNodes[i], position.x[i], position.y[i], position.z[i]);
    }
    graph.update();
    camera.update();
  },
});

scheduler.add({
  name: 'render',
  phase: 'render',
  update() {
    const size = position.size;
    for (let i = 0; i < CAPACITY; i += 1) {
      meshes[i].visible = i < size;
    }
    for (let i = 0; i < size; i += 1) {
      meshes[i].matrixWorld.copy(bodyNodes[i].worldMatrix);
    }
    renderCamera.matrixWorld.copy(cameraNode.worldMatrix);
    renderCamera.matrixWorldInverse.copy(camera.viewMatrix);
    renderCamera.projectionMatrix.copy(camera.projectionMatrix);
    renderCamera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.render(scene, renderCamera);
  },
});

populate();

const loop = createLoop({ source: createRafSource(window), scheduler });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetTime();
});

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

  let visibleMeshes = 0;
  for (let i = 0; i < CAPACITY; i += 1) {
    if (meshes[i].visible) visibleMeshes += 1;
  }

  return {
    three: THREE.REVISION,
    frames: loop.frame,
    steps: loop.steps,
    alpha: loop.fixedStep.alpha,
    gameMs: loop.clock.gameMs,
    nodes: countNodes(root),
    entities: {
      alive: world.entities.alive,
      used: world.entities.used,
      created: world.entities.stats.created,
      destroyed: world.entities.stats.destroyed,
      reused: world.entities.stats.reused,
    },
    stores: {
      position: position.size,
      velocity: velocity.size,
      health: health.size,
    },
    world: {
      spawned: world.stats.spawned,
      despawned: world.stats.despawned,
      pending: world.pending,
      pendingPeak: world.stats.pendingPeak,
    },
    events: {
      posted: events.stats.posted,
      delivered: events.stats.delivered,
      deferred: events.stats.deferred,
      unheard: events.stats.unheard,
      dropped: events.stats.dropped,
      peak: events.stats.peak,
      queued: events.size,
    },
    graph: {
      traversals: graph.stats.traversals,
      visited: graph.stats.visited,
      localRecomputed: graph.stats.localRecomputed,
      worldRecomputed: graph.stats.worldRecomputed,
    },
    sim: { damageSent: sim.damageSent, deaths: sim.deaths, bounces: sim.bounces },
    visibleMeshes,
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
   * Прогон виртуальным временем. Сбрасывается всё состояние мира, а не только
   * часы: иначе кадр перестанет быть функцией своего номера (правило главы 2).
   */
  runVirtual(frames: number, stepMs: number) {
    loop.stop();
    loop.resetTime();
    world.reset();
    position.clear();
    velocity.clear();
    health.clear();
    events.clear();
    events.resetStats();
    step = 0;
    sim.damageSent = 0;
    sim.deaths = 0;
    sim.bounces = 0;
    populate();
    graph.resetStats();
    for (let i = 1; i <= frames; i += 1) {
      loop.tick(i * stepMs);
    }
    return readReport();
  },

  start() {
    loop.start();
  },

  stop() {
    loop.stop();
  },
};
