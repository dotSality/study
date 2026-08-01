// Контрольная точка 1: та же сцена, что в главе 4, но собранная движком.
// Здесь не осталось ни одной строчки, которая заводила бы часы, шаг, обход
// графа или уборку мира вручную: всё это делает ядро, а сцена только говорит,
// что в ней живёт и в какой фазе это двигать.
import { Mesh, MeshBasicMaterial, REVISION, SphereGeometry } from 'three';
import {
  addChild,
  createComponentStore,
  createEngine,
  createRafSource,
  createSceneNode,
  createVectorStore,
  fromAxisAngle,
  Quaternion,
  setLocalPosition,
  setLocalRotation,
  setLocalScale,
} from './engine/index.ts';
import type { FrameInfo, SceneNode } from './engine/index.ts';
import { createView } from './render/view.ts';

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

// --- сборка движка ----------------------------------------------------------

const engine = createEngine({
  source: createRafSource(window),
  config: { capacity: CAPACITY, eventCapacity: 64 },
});

const view = createView({
  canvas,
  cssWidth: CSS_WIDTH,
  cssHeight: CSS_HEIGHT,
  devicePixelRatio: window.devicePixelRatio,
  clearColor: CLEAR_COLOR,
});
engine.addSubsystem(view);

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

engine.addStore(position);
engine.addStore(velocity);
engine.addStore(health);

// --- сцена ------------------------------------------------------------------

// Узел и меш номер i обслуживают того, кто занимает место i в плотном массиве
// положений. Место меняет жильцов, узел остаётся на своей позиции в графе.
const bodyNodes: SceneNode[] = [];
for (let i = 0; i < CAPACITY; i += 1) {
  const node = createSceneNode(`body-${i}`);
  setLocalScale(node, 0.3, 0.3, 0.3);
  addChild(engine.root, node);
  bodyNodes.push(node);
}

// Камера движка — обычный узел (Р3.5), поэтому её можно посадить на стойку.
const cameraRig = createSceneNode('camera-rig');
addChild(engine.root, cameraRig);
addChild(cameraRig, engine.cameraNode);
setLocalPosition(engine.cameraNode, 0, 3, 11);
engine.camera.setPerspective(Math.PI / 3, CSS_WIDTH / CSS_HEIGHT, 0.1, 100);

const tilt = new Quaternion();
fromAxisAngle(1, 0, 0, -Math.atan2(3, 11), tilt);
setLocalRotation(engine.cameraNode, tilt);

const geometry = new SphereGeometry(1, 12, 8);
const material = new MeshBasicMaterial({ color: BODY_COLOR, wireframe: true });
const meshes: Mesh[] = [];
for (let i = 0; i < CAPACITY; i += 1) {
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.visible = false;
  view.add(mesh);
  meshes.push(mesh);
}

// --- заселение мира ---------------------------------------------------------

/** Тело номер i: место и скорость считаются от номера, без случайных чисел. */
function spawnBody(i: number): void {
  const entity = engine.spawn();
  const angle = (i / BODY_COUNT) * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  position.add(entity, cos * START_RADIUS, sin * START_RADIUS, 0);
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

// --- игровые системы --------------------------------------------------------

const sim = { damageSent: 0, deaths: 0, bounces: 0 };
let step = 0;

engine.addSystem({
  name: 'motion',
  phase: 'fixed',
  order: 0,
  update() {
    const dt = engine.config.fixedStep.stepMs / 1000;
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

engine.addSystem({
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
    engine.events.post(EVENT_DAMAGE, victim, 1, 0, 0, frame.gameMs);
    sim.damageSent += 1;
    if (step % 5 === 0) {
      // Событие в будущее: доедет через DELAYED_DAMAGE_MS игрового времени.
      engine.events.post(EVENT_DAMAGE, victim, 1, 0, 0, frame.gameMs + DELAYED_DAMAGE_MS);
      sim.damageSent += 1;
    }
  },
});

engine.events.subscribe(EVENT_DAMAGE, (event) => {
  const hp = health.get(event.target);
  // Цель могла умереть между отправкой и доставкой: здоровье в нуле — сущность
  // уже приговорена и ждёт уборки, второй раз её не убивают.
  if (hp === null || hp.current <= 0) return;
  hp.current -= event.a;
  if (hp.current <= 0) {
    engine.events.post(EVENT_DIED, event.target);
  }
});

engine.events.subscribe(EVENT_DIED, (event) => {
  if (engine.despawn(event.target)) {
    sim.deaths += 1;
  }
});

// Синхронизация идёт раньше системы ядра `core:transforms` (order 1000):
// сначала мир кладёт положения в узлы, потом ядро считает мировые матрицы.
engine.addSystem({
  name: 'sync',
  phase: 'update',
  order: 0,
  update() {
    const size = position.size;
    for (let i = 0; i < size; i += 1) {
      setLocalPosition(bodyNodes[i], position.x[i], position.y[i], position.z[i]);
    }
  },
});

engine.addSystem({
  name: 'draw',
  phase: 'render',
  order: 0,
  update() {
    const size = position.size;
    for (let i = 0; i < CAPACITY; i += 1) {
      meshes[i].visible = i < size;
    }
    for (let i = 0; i < size; i += 1) {
      meshes[i].matrixWorld.copy(bodyNodes[i].worldMatrix);
    }
    view.render(engine.camera);
  },
});

// --- запуск -----------------------------------------------------------------

populate();
engine.start();

const standDriven = new URLSearchParams(window.location.search).has('stand');
if (standDriven) {
  // Стенд ведёт кадры сам: подсистемы запущены, подача кадров закрыта.
  engine.reset();
  populate();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) engine.resetTime();
});

const centerPixel = new Uint8Array(4);

function readReport() {
  view.readPixel(Math.floor(view.buffer.width / 2), Math.floor(view.buffer.height / 2), centerPixel);

  let visibleMeshes = 0;
  for (let i = 0; i < CAPACITY; i += 1) {
    if (meshes[i].visible) visibleMeshes += 1;
  }

  return {
    three: REVISION,
    engine: engine.report(),
    stores: {
      position: position.size,
      velocity: velocity.size,
      health: health.size,
    },
    sim: { damageSent: sim.damageSent, deaths: sim.deaths, bounces: sim.bounces },
    visibleMeshes,
    info: view.info(),
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

  /** Прогон виртуальным временем: движок сбрасывается целиком, сцена — заново. */
  runVirtual(frames: number, stepMs: number) {
    engine.reset();
    step = 0;
    sim.damageSent = 0;
    sim.deaths = 0;
    sim.bounces = 0;
    populate();
    for (let i = 1; i <= frames; i += 1) {
      engine.tick(i * stepMs);
    }
    return readReport();
  },

  start() {
    engine.start();
  },

  stop() {
    engine.stop();
  },
};
