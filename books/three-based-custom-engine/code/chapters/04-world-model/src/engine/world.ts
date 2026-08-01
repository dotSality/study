// Мир: реестр сущностей плюс список хранилищ, которые надо почистить, когда
// сущность уходит. Удаление здесь отложенное — иначе система, идущая по
// плотному массиву, теряет под собой элементы прямо во время обхода.

import type { Entity } from './entity.ts';
import { createEntityRegistry, entityIndex } from './entity.ts';
import type { EntityRegistry } from './entity.ts';
import type { EntityStore } from './component-store.ts';

export interface WorldStats {
  spawned: number;
  /** Сколько сущностей поставлено в очередь на удаление. */
  despawned: number;
  /** Сколько удалений применил последний flush(). */
  flushed: number;
  /** Наибольшая длина очереди удалений за всё время. */
  pendingPeak: number;
  /** Сколько удалений отброшено переполненной очередью. */
  dropped: number;
}

export interface World {
  readonly entities: EntityRegistry;
  readonly stores: readonly EntityStore[];
  readonly stats: WorldStats;
  /** Сколько сущностей ждёт удаления. */
  readonly pending: number;
  addStore(store: EntityStore): void;
  spawn(): Entity;
  /** Поставить в очередь на удаление. Сущность жива до ближайшего flush(). */
  despawn(entity: Entity): boolean;
  isDespawning(entity: Entity): boolean;
  /** Применить отложенные удаления. Зовётся один раз за кадр, вне обходов. */
  flush(): number;
  reset(): void;
}

export function createWorld(capacity: number): World {
  const entities = createEntityRegistry(capacity);
  const stores: EntityStore[] = [];

  // Очередь удалений и отметка «уже в очереди» — оба массива постоянной длины.
  const queue = new Uint32Array(capacity);
  const queued = new Uint8Array(capacity);
  let pending = 0;

  const stats: WorldStats = {
    spawned: 0,
    despawned: 0,
    flushed: 0,
    pendingPeak: 0,
    dropped: 0,
  };

  return {
    entities,
    stores,
    stats,

    get pending() {
      return pending;
    },

    addStore(store) {
      stores.push(store);
    },

    spawn() {
      const entity = entities.create();
      stats.spawned += 1;
      return entity;
    },

    despawn(entity) {
      if (!entities.isAlive(entity)) {
        return false;
      }
      const index = entityIndex(entity);
      // Повторный despawn за тот же кадр — не ошибка вызывающего, а обычное
      // дело: две системы вправе решить, что сущность отжила своё.
      if (queued[index] === 1) {
        return false;
      }
      if (pending === queue.length) {
        stats.dropped += 1;
        return false;
      }
      queue[pending] = entity;
      pending += 1;
      queued[index] = 1;
      stats.despawned += 1;
      if (pending > stats.pendingPeak) {
        stats.pendingPeak = pending;
      }
      return true;
    },

    isDespawning(entity) {
      return entities.isAlive(entity) && queued[entityIndex(entity)] === 1;
    },

    flush() {
      const count = pending;
      for (let i = 0; i < count; i += 1) {
        const entity = queue[i];
        queued[entityIndex(entity)] = 0;
        for (let s = 0; s < stores.length; s += 1) {
          stores[s].remove(entity);
        }
        entities.destroy(entity);
      }
      // Удаления, поставленные во время самого flush(), в этот проход не
      // попадают: они сдвигаются в начало очереди и ждут следующего.
      const rest = pending - count;
      for (let i = 0; i < rest; i += 1) {
        queue[i] = queue[count + i];
      }
      pending = rest;
      stats.flushed = count;
      return count;
    },

    reset() {
      entities.reset();
      queued.fill(0);
      pending = 0;
      stats.spawned = 0;
      stats.despawned = 0;
      stats.flushed = 0;
      stats.pendingPeak = 0;
      stats.dropped = 0;
    },
  };
}
