// Адаптер соответствия. Стенд знает только имена из этого файла.
// Своё API вы называете как хотите — правится адаптер, тесты не трогаются.
//
// С контрольной точки 1 адаптер импортирует ровно один файл — точку входа
// движка. Если для теста понадобилось лезть в модуль мимо неё, значит либо
// поверхность неполна, либо проверка залезла во внутренности (часть 5.1).
import {
  addChild,
  advanceFixedStep,
  angleBetween,
  applyToDirection,
  applyToPoint,
  clipToNdc,
  composeWorld,
  concat,
  CORE_ORDER,
  CORE_SYSTEMS,
  countNodes,
  createCamera,
  createClock,
  createComponentStore,
  createEngine,
  createEntityRegistry,
  createEventQueue,
  createFixedStep,
  createLoop,
  createManualSource,
  createPool,
  createSceneGraph,
  createSceneNode,
  createScheduler,
  createVectorStore,
  createWorld,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_FIXED_STEP,
  elementIndex,
  ENGINE_EULER_ORDER,
  entityGeneration,
  entityIndex,
  FIXED_STEP_MS,
  fromAxisAngle,
  fromYawPitchRoll,
  GENERATION_BITS,
  getLocalPosition,
  INDEX_BITS,
  interpolate,
  invert,
  isInsideViewVolume,
  isLocalDirty,
  isWorldDirty,
  makeEntity,
  MAX_CAPACITY,
  MAX_GENERATION,
  MAX_INDEX,
  MAX_PIXEL_RATIO,
  ndcToScreen,
  NO_ENTITY,
  PHASES,
  readAxisX,
  readAxisY,
  readAxisZ,
  readOrigin,
  removeChild,
  resolveDrawingBuffer,
  resolveEngineConfig,
  rotateVector,
  sameOrientation,
  setLocalPosition,
  setLocalRotation,
  setLocalScale,
  stepClockOnce,
  tickClock,
  toYawPitchRoll,
  translateLocal,
  worldToClip,
} from '../src/engine/index.ts';

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

  // Глава 5: сборка ядра и конфигурация
  defaultConfig: DEFAULT_ENGINE_CONFIG,
  maxCapacity: MAX_CAPACITY,
  coreSystems: CORE_SYSTEMS,
  coreOrder: CORE_ORDER,
  resolveConfig: (config) => resolveEngineConfig(config),

  /** Контракт стенда: движок собирается из источника кадров и конфигурации. */
  newEngine: (source, config) => createEngine({ source, config }),
};
