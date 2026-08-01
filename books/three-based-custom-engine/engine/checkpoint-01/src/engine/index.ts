// Точка входа движка. Всё, что снаружи ядра вправе знать о нём, перечислено
// здесь поимённо: `export *` из модулей не используется намеренно, иначе
// публичной становилась бы любая мелочь, которую кто-то экспортировал для
// соседнего модуля. Список — это решение, а не следствие (часть 5.1).
//
// Модули ядра друг друга импортируют напрямую: точка входа собирает поверхность
// для внешнего мира, а не служит шиной внутри ядра — иначе в графе импортов
// немедленно появился бы цикл.

// Глава 1 — размер картинки.
export { MAX_PIXEL_RATIO, resolveDrawingBuffer } from './viewport.ts';
export type { DrawingBuffer, ViewportRequest } from './viewport.ts';

// Глава 2 — время, шаг, фазы, цикл, пул.
export { createClock, resetClock, stepClockOnce, tickClock } from './clock.ts';
export type { EngineClock } from './clock.ts';
export {
  advanceFixedStep,
  createFixedStep,
  DEFAULT_FIXED_STEP,
  FIXED_STEP_MS,
  resetFixedStep,
} from './fixed-step.ts';
export type { FixedStepConfig, FixedStepState } from './fixed-step.ts';
export { createManualSource, createRafSource } from './frame-source.ts';
export type { FrameSource, ManualSource } from './frame-source.ts';
export { createScheduler, PHASES } from './scheduler.ts';
export type { FrameInfo, Phase, Scheduler, System } from './scheduler.ts';
export { createLoop } from './loop.ts';
export type { Loop, LoopOptions } from './loop.ts';
export { createPool } from './pool.ts';
export type { Pool } from './pool.ts';

// Глава 3 — математика, повороты, граф сцены, камера.
export {
  applyToDirection,
  applyToPoint,
  composeLocal,
  composeWorld,
  elementIndex,
  FORWARD_AXIS,
  HANDEDNESS,
  MATRIX_ELEMENT_COUNT,
  MATRIX_SIZE,
  Matrix4,
  Quaternion,
  readAxisX,
  readAxisY,
  readAxisZ,
  readColumn,
  readOrigin,
  UP_AXIS,
  Vector3,
} from './math.ts';
export {
  angleBetween,
  concat,
  ENGINE_EULER_ORDER,
  fromAxisAngle,
  fromUnitVectors,
  fromYawPitchRoll,
  interpolate,
  invert,
  rotateVector,
  sameOrientation,
  toYawPitchRoll,
} from './rotation.ts';
export {
  addChild,
  countNodes,
  createGraphStats,
  createSceneGraph,
  createSceneNode,
  getLocalPosition,
  getLocalRotation,
  getLocalScale,
  isLocalDirty,
  isWorldDirty,
  markTreeDirty,
  removeChild,
  setLocalPosition,
  setLocalRotation,
  setLocalScale,
  translateLocal,
} from './scene-graph.ts';
export type { GraphStats, SceneGraph, SceneNode } from './scene-graph.ts';
export { clipToNdc, createCamera, isInsideViewVolume, ndcToScreen, worldToClip } from './camera.ts';
export type { Camera } from './camera.ts';

// Глава 4 — сущности, хранилища, мир, события.
export {
  createEntityRegistry,
  entityGeneration,
  entityIndex,
  GENERATION_BITS,
  INDEX_BITS,
  makeEntity,
  MAX_GENERATION,
  MAX_INDEX,
  NO_ENTITY,
} from './entity.ts';
export type { Entity, EntityRegistry, EntityStats } from './entity.ts';
export { createComponentStore } from './component-store.ts';
export type { ComponentStore, ComponentStoreOptions, EntityStore } from './component-store.ts';
export { createVectorStore } from './vector-store.ts';
export type { VectorStore, VectorStoreOptions } from './vector-store.ts';
export { createWorld } from './world.ts';
export type { World, WorldStats } from './world.ts';
export { createEventQueue } from './events.ts';
export type { EventHandler, EventQueue, EventStats, GameEvent } from './events.ts';

// Глава 5 — сборка и конфигурация.
export { DEFAULT_ENGINE_CONFIG, MAX_CAPACITY, resolveEngineConfig } from './config.ts';
export type { EngineConfig, ResolvedEngineConfig } from './config.ts';
export { CORE_ORDER, CORE_SYSTEMS, createEngine } from './engine.ts';
export type { Engine, EngineOptions, EngineReport, Subsystem } from './engine.ts';
