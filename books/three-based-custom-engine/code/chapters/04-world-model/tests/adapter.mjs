// Адаптер соответствия. Стенд знает только имена из этого файла.
// Своё API вы называете как хотите — правится адаптер, тесты не трогаются.
import { resolveDrawingBuffer, MAX_PIXEL_RATIO } from '../src/engine/viewport.ts';
import {
  advanceFixedStep,
  createFixedStep,
  DEFAULT_FIXED_STEP,
  FIXED_STEP_MS,
} from '../src/engine/fixed-step.ts';
import { createClock, stepClockOnce, tickClock } from '../src/engine/clock.ts';
import { createScheduler, PHASES } from '../src/engine/scheduler.ts';
import { createManualSource } from '../src/engine/frame-source.ts';
import { createLoop } from '../src/engine/loop.ts';
import { createPool } from '../src/engine/pool.ts';
import {
  applyToDirection,
  applyToPoint,
  composeWorld,
  elementIndex,
  readAxisX,
  readAxisY,
  readAxisZ,
  readOrigin,
} from '../src/engine/math.ts';
import {
  angleBetween,
  concat,
  ENGINE_EULER_ORDER,
  fromAxisAngle,
  fromYawPitchRoll,
  interpolate,
  invert,
  rotateVector,
  sameOrientation,
  toYawPitchRoll,
} from '../src/engine/rotation.ts';
import {
  addChild,
  countNodes,
  createSceneGraph,
  createSceneNode,
  getLocalPosition,
  isLocalDirty,
  isWorldDirty,
  removeChild,
  setLocalPosition,
  setLocalRotation,
  setLocalScale,
  translateLocal,
} from '../src/engine/scene-graph.ts';
import {
  clipToNdc,
  createCamera,
  isInsideViewVolume,
  ndcToScreen,
  worldToClip,
} from '../src/engine/camera.ts';
import {
  createEntityRegistry,
  entityGeneration,
  entityIndex,
  GENERATION_BITS,
  INDEX_BITS,
  makeEntity,
  MAX_GENERATION,
  MAX_INDEX,
  NO_ENTITY,
} from '../src/engine/entity.ts';
import { createComponentStore } from '../src/engine/component-store.ts';
import { createVectorStore } from '../src/engine/vector-store.ts';
import { createWorld } from '../src/engine/world.ts';
import { createEventQueue } from '../src/engine/events.ts';

export const engine = {
  // Глава 1
  maxPixelRatio: MAX_PIXEL_RATIO,
  drawingBuffer(cssWidth, cssHeight, devicePixelRatio, maxPixelRatio = MAX_PIXEL_RATIO) {
    return resolveDrawingBuffer({ cssWidth, cssHeight, devicePixelRatio }, maxPixelRatio);
  },

  // Глава 2: шаг симуляции
  fixedStepMs: FIXED_STEP_MS,
  defaultFixedStep: DEFAULT_FIXED_STEP,
  newFixedStep: () => createFixedStep(),
  advance: (state, frameMs, config = DEFAULT_FIXED_STEP) => advanceFixedStep(state, frameMs, config),

  // Глава 2: часы
  newClock: () => createClock(),
  tickClock: (clock, realDeltaMs) => tickClock(clock, realDeltaMs),
  stepClockOnce: (clock, stepMs) => stepClockOnce(clock, stepMs),

  // Глава 2: фазы и планировщик
  phases: PHASES,
  newScheduler: () => createScheduler(),

  // Глава 2: цикл и источник кадров
  newManualSource: (startMs = 0) => createManualSource(startMs),
  newLoop: (options) => createLoop(options),

  // Глава 2: пул
  newPool: (create, reset, capacity) => createPool(create, reset, capacity),

  // Глава 3: соглашения математики
  elementIndex,
  axisX: readAxisX,
  axisY: readAxisY,
  axisZ: readAxisZ,
  origin: readOrigin,
  applyToPoint,
  applyToDirection,
  composeWorld,

  // Глава 3: повороты
  eulerOrder: ENGINE_EULER_ORDER,
  fromAxisAngle,
  fromYawPitchRoll,
  toYawPitchRoll,
  concatRotations: concat,
  invertRotation: invert,
  interpolateRotations: interpolate,
  angleBetween,
  rotateVector,
  sameOrientation,

  // Глава 3: граф сцены
  newNode: (name) => createSceneNode(name),
  newGraph: (root) => createSceneGraph(root),
  addChild,
  removeChild,
  setLocalPosition,
  setLocalRotation,
  setLocalScale,
  translateLocal,
  getLocalPosition,
  isLocalDirty,
  isWorldDirty,
  countNodes,

  // Глава 3: камера и цепочка пространств
  newCamera: (node) => createCamera(node),
  worldToClip,
  isInsideViewVolume,
  clipToNdc,
  ndcToScreen,

  // Глава 4: дескриптор сущности
  indexBits: INDEX_BITS,
  generationBits: GENERATION_BITS,
  maxIndex: MAX_INDEX,
  maxGeneration: MAX_GENERATION,
  noEntity: NO_ENTITY,
  makeEntity,
  entityIndex,
  entityGeneration,

  // Глава 4: реестр, хранилища, мир, события
  newRegistry: (capacity) => createEntityRegistry(capacity),
  newComponentStore: (options) => createComponentStore(options),
  newVectorStore: (options) => createVectorStore(options),
  newWorld: (capacity) => createWorld(capacity),
  newEventQueue: (capacity) => createEventQueue(capacity),
};
