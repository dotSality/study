// Очередь событий. Отправитель кладёт событие и возвращается; обработчики зовёт
// диспетчер в той фазе кадра, где это безопасно. Ёмкость постоянная, объекты
// событий созданы заранее — отправка не выделяет память.

import type { Entity } from './entity.ts';
import { NO_ENTITY } from './entity.ts';

/**
 * Событие. Тип — целое число: строку пришлось бы сравнивать посимвольно,
 * а числовой тип и сравнивается за такт, и не занимает места сверх поля.
 */
export interface GameEvent {
  type: number;
  /** Кому адресовано. NO_ENTITY — событие мира, а не сущности. */
  target: Entity;
  /** Кто отправил. */
  source: Entity;
  a: number;
  b: number;
  c: number;
  /** Игровое время, начиная с которого событие можно доставлять, мс. */
  deliveryMs: number;
  /** Больше — раньше при совпадении времени доставки. */
  priority: number;
  /** Номер отправки. Разрешает ничью, когда совпали и время, и приоритет. */
  sequence: number;
}

export type EventHandler = (event: Readonly<GameEvent>) => void;

export interface EventStats {
  posted: number;
  delivered: number;
  /** Доставленные события, у которых не оказалось ни одного подписчика. */
  unheard: number;
  /** Отброшено переполненной очередью. */
  dropped: number;
  /** Наибольшая длина очереди за всё время. */
  peak: number;
  /** Отправлено из обработчика: такое событие ждёт следующей доставки. */
  deferred: number;
}

export interface EventQueue {
  readonly capacity: number;
  readonly size: number;
  readonly stats: EventStats;
  /** Идёт ли доставка прямо сейчас. */
  readonly dispatching: boolean;
  subscribe(type: number, handler: EventHandler): () => void;
  listeners(type: number): number;
  post(
    type: number,
    target?: Entity,
    a?: number,
    b?: number,
    c?: number,
    deliveryMs?: number,
    priority?: number,
    source?: Entity,
  ): boolean;
  /** Доставить всё, чей срок настал. Возвращает число доставленных событий. */
  dispatch(nowMs: number): number;
  /** Ближайшее время доставки в очереди или Infinity, если очередь пуста. */
  nextDeliveryMs(): number;
  clear(): void;
  resetStats(): void;
}

export function createEventQueue(capacity: number): EventQueue {
  // Запас событий: объекты созданы здесь и переиспользуются вечно.
  const events: GameEvent[] = [];
  const freeSlots = new Int32Array(capacity);
  for (let i = 0; i < capacity; i += 1) {
    events.push({
      type: 0,
      target: NO_ENTITY,
      source: NO_ENTITY,
      a: 0,
      b: 0,
      c: 0,
      deliveryMs: 0,
      priority: 0,
      sequence: 0,
    });
    // Свободные места выдаются с конца, поэтому запас укладывается наоборот.
    freeSlots[i] = capacity - 1 - i;
  }
  let freeTop = capacity;

  // Порядок доставки: номера мест, упорядоченные по (время, приоритет, номер).
  const order = new Int32Array(capacity);
  // Партия текущей доставки: сюда события уходят до вызова обработчиков.
  const batch = new Int32Array(capacity);

  const handlers = new Map<number, EventHandler[]>();

  let size = 0;
  let sequence = 0;
  let dispatching = false;

  const stats: EventStats = {
    posted: 0,
    delivered: 0,
    unheard: 0,
    dropped: 0,
    peak: 0,
    deferred: 0,
  };

  /** Раньше ли событие в месте a, чем событие в месте b. */
  function earlier(left: GameEvent, right: GameEvent): boolean {
    if (left.deliveryMs !== right.deliveryMs) return left.deliveryMs < right.deliveryMs;
    if (left.priority !== right.priority) return left.priority > right.priority;
    return left.sequence < right.sequence;
  }

  return {
    capacity,
    stats,

    get size() {
      return size;
    },

    get dispatching() {
      return dispatching;
    },

    subscribe(type, handler) {
      let list = handlers.get(type);
      if (list === undefined) {
        list = [];
        handlers.set(type, list);
      }
      list.push(handler);
      return () => {
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
      };
    },

    listeners(type) {
      return handlers.get(type)?.length ?? 0;
    },

    post(
      type,
      target = NO_ENTITY,
      a = 0,
      b = 0,
      c = 0,
      deliveryMs = 0,
      priority = 0,
      source = NO_ENTITY,
    ) {
      if (freeTop === 0) {
        stats.dropped += 1;
        return false;
      }
      freeTop -= 1;
      const slot = freeSlots[freeTop];
      const event = events[slot];
      event.type = type;
      event.target = target;
      event.source = source;
      event.a = a;
      event.b = b;
      event.c = c;
      event.deliveryMs = deliveryMs;
      event.priority = priority;
      event.sequence = sequence;
      sequence += 1;

      // Вставка на своё место сдвигом: очередь всегда упорядочена, поэтому
      // доставка не сортирует ничего и не выделяет память под временный массив.
      let i = size;
      while (i > 0 && earlier(event, events[order[i - 1]])) {
        order[i] = order[i - 1];
        i -= 1;
      }
      order[i] = slot;
      size += 1;

      stats.posted += 1;
      if (size > stats.peak) stats.peak = size;
      if (dispatching) stats.deferred += 1;
      return true;
    },

    dispatch(nowMs) {
      // Граница партии: события, отправленные обработчиками, имеют номер
      // не меньше этого и в текущий проход не попадают. Без границы обработчик,
      // отправляющий событие себе, зациклил бы доставку.
      const limit = sequence;

      let taken = 0;
      let keep = 0;
      for (let i = 0; i < size; i += 1) {
        const slot = order[i];
        const event = events[slot];
        if (event.deliveryMs > nowMs) {
          // Дальше только более поздние: очередь упорядочена по времени.
          order[keep] = slot;
          keep += 1;
          for (let j = i + 1; j < size; j += 1) {
            order[keep] = order[j];
            keep += 1;
          }
          break;
        }
        if (event.sequence >= limit) {
          order[keep] = slot;
          keep += 1;
          continue;
        }
        batch[taken] = slot;
        taken += 1;
      }
      size = keep;

      dispatching = true;
      try {
        for (let i = 0; i < taken; i += 1) {
          const slot = batch[i];
          const event = events[slot];
          const list = handlers.get(event.type);
          if (list === undefined || list.length === 0) {
            stats.unheard += 1;
          } else {
            for (let h = 0; h < list.length; h += 1) {
              list[h](event);
            }
          }
          stats.delivered += 1;
          // Место возвращается в запас только после обработчиков: иначе
          // отправка из обработчика заняла бы ещё не прочитанное событие.
          freeSlots[freeTop] = slot;
          freeTop += 1;
        }
      } finally {
        dispatching = false;
      }
      return taken;
    },

    nextDeliveryMs() {
      return size === 0 ? Infinity : events[order[0]].deliveryMs;
    },

    clear() {
      for (let i = 0; i < size; i += 1) {
        freeSlots[freeTop] = order[i];
        freeTop += 1;
      }
      size = 0;
    },

    resetStats() {
      stats.posted = 0;
      stats.delivered = 0;
      stats.unheard = 0;
      stats.dropped = 0;
      stats.peak = 0;
      stats.deferred = 0;
    },
  };
}
