// Хранилище компонентов одного вида. Значения лежат в плотном массиве без дыр,
// а найти своё место по дескриптору сущности помогает разрежённая карта.
// Система обходит плотный массив подряд и не спрашивает «а есть ли компонент».

import type { Entity } from './entity.ts';
import { entityIndex, NO_ENTITY } from './entity.ts';

/**
 * Минимум, который мир требует от хранилища: убрать одну сущность при удалении
 * и опустеть целиком при сбросе мира. Второе понадобилось при сборке ядра
 * (часть 5.1): сброс, забывший хранилище, оставляет мир недосброшенным.
 */
export interface EntityStore {
  readonly name: string;
  remove(entity: Entity): boolean;
  clear(): void;
}

export interface ComponentStore<T> extends EntityStore {
  readonly capacity: number;
  /** Сколько компонентов занято сейчас. Первые size мест плотного массива. */
  readonly size: number;
  /** Плотный массив значений: место i принадлежит сущности owners[i]. */
  readonly values: readonly T[];
  /** Владельцы мест плотного массива. За границей size — прошлые владельцы. */
  readonly owners: readonly Entity[];
  /** Сколько раз хранилище отказало из-за исчерпанной ёмкости. */
  readonly denied: number;
  has(entity: Entity): boolean;
  /** Место сущности в плотном массиве или −1. */
  slotOf(entity: Entity): number;
  get(entity: Entity): T | null;
  /** Выдать компонент сущности. Значение берётся из запаса, а не создаётся. */
  add(entity: Entity): T;
  clear(): void;
}

export interface ComponentStoreOptions<T> {
  readonly name: string;
  /** Сколько компонентов этого вида существует одновременно. */
  readonly capacity: number;
  /** Ёмкость реестра сущностей: столько мест в разрежённой карте. */
  readonly entityCapacity: number;
  /** Как выглядит новый компонент. Зовётся ровно capacity раз при сборке. */
  create: () => T;
  /** Привести компонент к исходному виду перед выдачей. */
  reset: (value: T) => void;
}

export function createComponentStore<T>(options: ComponentStoreOptions<T>): ComponentStore<T> {
  const { name, capacity, entityCapacity, create, reset } = options;

  // Весь запас создаётся сразу — как пул из части 2.4. Выдача компонента
  // в ходе кадра не выделяет память ни разу.
  const values: T[] = [];
  for (let i = 0; i < capacity; i += 1) {
    values.push(create());
  }

  const owners: Entity[] = new Array<Entity>(capacity).fill(NO_ENTITY);
  // Разрежённая карта: индекс сущности → место в плотном массиве, −1 — нет.
  const slots = new Int32Array(entityCapacity).fill(-1);

  let size = 0;
  let denied = 0;

  function slotOf(entity: Entity): number {
    const slot = slots[entityIndex(entity)];
    // Сверка полного дескриптора, а не одного индекса: у места мог смениться
    // жилец, и устаревший дескриптор нашёл бы чужой компонент.
    return slot >= 0 && owners[slot] === entity ? slot : -1;
  }

  return {
    name,
    capacity,
    values,
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

    get(entity) {
      const slot = slotOf(entity);
      return slot < 0 ? null : values[slot];
    },

    add(entity) {
      const existing = slotOf(entity);
      if (existing >= 0) {
        return values[existing];
      }
      if (size === capacity) {
        denied += 1;
        throw new RangeError(`component store "${name}" exhausted: capacity ${capacity}`);
      }
      const slot = size;
      size += 1;
      owners[slot] = entity;
      slots[entityIndex(entity)] = slot;
      reset(values[slot]);
      return values[slot];
    },

    remove(entity) {
      const slot = slotOf(entity);
      if (slot < 0) {
        return false;
      }
      size -= 1;
      const last = size;
      if (slot !== last) {
        // Дыру закрывает последний компонент: значения меняются местами,
        // поэтому оба объекта остаются в запасе и ничего не создаётся заново.
        const movedValue = values[last];
        values[last] = values[slot];
        values[slot] = movedValue;
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
