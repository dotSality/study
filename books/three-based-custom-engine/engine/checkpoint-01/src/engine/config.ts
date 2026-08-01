// Конфигурация запуска: всё, что у движка можно настроить снаружи, собрано
// в один объект данных и проверяется в одном месте. Настройка, пришедшая
// с бессмыслицей, обрывает сборку — молчаливое умолчание вместо ошибки
// стоит дороже, потому что проявляется через десять кадров и в другом месте.

import { FIXED_STEP_MS } from './fixed-step.ts';
import type { FixedStepConfig } from './fixed-step.ts';
import { MAX_INDEX } from './entity.ts';

/** Что вправе задать тот, кто собирает движок. Пропущенное берётся из умолчаний. */
export interface EngineConfig {
  /** Сколько сущностей помещается в мир. */
  readonly capacity?: number;
  /** Сколько событий помещается в очередь. */
  readonly eventCapacity?: number;
  /** Длительность шага симуляции, мс. */
  readonly stepMs?: number;
  /** Потолок кадра: время сверх него симуляции не отдаётся, мс. */
  readonly maxFrameMs?: number;
  /** Потолок числа шагов за кадр. */
  readonly maxStepsPerFrame?: number;
}

/** Конфигурация после проверки: ни одного пропуска и ни одного «а вдруг». */
export interface ResolvedEngineConfig {
  readonly capacity: number;
  readonly eventCapacity: number;
  readonly fixedStep: FixedStepConfig;
}

/** Умолчания движка. Объект с `as const` вместо `enum` — правило Р1.3. */
export const DEFAULT_ENGINE_CONFIG = {
  capacity: 1024,
  eventCapacity: 256,
  stepMs: FIXED_STEP_MS,
  maxFrameMs: 250,
  maxStepsPerFrame: 5,
} as const;

/** Наибольшая ёмкость, которую различает дескриптор сущности (глава 4). */
export const MAX_CAPACITY = MAX_INDEX + 1;

function requireCount(name: string, value: number, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(
      `engine config: ${name} must be an integer in [1, ${max}], got ${String(value)}`,
    );
  }
  return value;
}

function requireDuration(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`engine config: ${name} must be a positive number, got ${String(value)}`);
  }
  return value;
}

/**
 * Свести пожелания с умолчаниями и проверить результат. Возвращается новый
 * объект: конфигурация движка не меняется после сборки, потому что половина
 * подсистем читает её один раз и запоминает.
 */
export function resolveEngineConfig(config: EngineConfig = {}): ResolvedEngineConfig {
  const capacity = requireCount(
    'capacity',
    config.capacity ?? DEFAULT_ENGINE_CONFIG.capacity,
    MAX_CAPACITY,
  );
  const eventCapacity = requireCount(
    'eventCapacity',
    config.eventCapacity ?? DEFAULT_ENGINE_CONFIG.eventCapacity,
    MAX_CAPACITY,
  );
  const maxStepsPerFrame = requireCount(
    'maxStepsPerFrame',
    config.maxStepsPerFrame ?? DEFAULT_ENGINE_CONFIG.maxStepsPerFrame,
    1000,
  );
  const stepMs = requireDuration('stepMs', config.stepMs ?? DEFAULT_ENGINE_CONFIG.stepMs);
  const maxFrameMs = requireDuration(
    'maxFrameMs',
    config.maxFrameMs ?? DEFAULT_ENGINE_CONFIG.maxFrameMs,
  );
  // Потолок кадра ниже шага означал бы, что симуляция не делает ни одного шага
  // никогда: время кадра целиком уходит в отброшенное.
  if (maxFrameMs < stepMs) {
    throw new RangeError(
      `engine config: maxFrameMs (${maxFrameMs}) must not be smaller than stepMs (${stepMs})`,
    );
  }

  return {
    capacity,
    eventCapacity,
    fixedStep: { stepMs, maxFrameMs, maxStepsPerFrame },
  };
}
