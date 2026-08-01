// Хранилище трёхмерных величин в раскладке «структура массивов»: три сплошных
// массива чисел вместо массива объектов. Система, которой нужны только X,
// читает подряд весь массив X и не перешагивает через соседние поля.

import type { Entity } from './entity.ts';
import { entityIndex, NO_ENTITY } from './entity.ts';
import type { EntityStore } from './component-store.ts';

export interface VectorStore extends EntityStore {
  readonly capacity: number;
  readonly size: number;
  /** Первые size значений — занятые места; дальше остатки прошлых жильцов. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly owners: Uint32Array;
  readonly denied: number;
  has(entity: Entity): boolean;
  slotOf(entity: Entity): number;
  /** Занять место под сущность и записать значение. Возвращает номер места. */
  add(entity: Entity, x: number, y: number, z: number): number;
  set(slot: number, x: number, y: number, z: number): void;
  clear(): void;
}

export interface VectorStoreOptions {
  readonly name: string;
  readonly capacity: number;
  readonly entityCapacity: number;
}

export function createVectorStore(options: VectorStoreOptions): VectorStore {
  const { name, capacity, entityCapacity } = options;

  // Три массива постоянной длины: память под них выделяется здесь и больше
  // никогда. Float32Array хранит одинарную точность — значение, записанное
  // как число JavaScript, читается округлённым.
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const z = new Float32Array(capacity);
  const owners = new Uint32Array(capacity).fill(NO_ENTITY);
  const slots = new Int32Array(entityCapacity).fill(-1);

  let size = 0;
  let denied = 0;

  function slotOf(entity: Entity): number {
    const slot = slots[entityIndex(entity)];
    return slot >= 0 && owners[slot] === entity ? slot : -1;
  }

  return {
    name,
    capacity,
    x,
    y,
    z,
    owners,

    get size() {
      return size;
    },

    get denied() {
      return denied;
    },

    slotOf,

    has(entity) {
      return slotOf(entity) >= 0;
    },

    add(entity, vx, vy, vz) {
      const existing = slotOf(entity);
      if (existing >= 0) {
        x[existing] = vx;
        y[existing] = vy;
        z[existing] = vz;
        return existing;
      }
      if (size === capacity) {
        denied += 1;
        throw new RangeError(`vector store "${name}" exhausted: capacity ${capacity}`);
      }
      const slot = size;
      size += 1;
      owners[slot] = entity;
      slots[entityIndex(entity)] = slot;
      x[slot] = vx;
      y[slot] = vy;
      z[slot] = vz;
      return slot;
    },

    set(slot, vx, vy, vz) {
      x[slot] = vx;
      y[slot] = vy;
      z[slot] = vz;
    },

    remove(entity) {
      const slot = slotOf(entity);
      if (slot < 0) {
        return false;
      }
      size -= 1;
      const last = size;
      if (slot !== last) {
        // Числа не переставляются местами, а копируются: свободного места
        // за границей size всё равно никто не читает.
        x[slot] = x[last];
        y[slot] = y[last];
        z[slot] = z[last];
        const movedOwner = owners[last];
        owners[slot] = movedOwner;
        slots[entityIndex(movedOwner)] = slot;
      }
      owners[last] = NO_ENTITY;
      slots[entityIndex(entity)] = -1;
      return true;
    },

    clear() {
      for (let i = 0; i < size; i += 1) {
        slots[entityIndex(owners[i])] = -1;
        owners[i] = NO_ENTITY;
      }
      size = 0;
    },
  };
}
