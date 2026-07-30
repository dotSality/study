// Пул объектов: постоянный запас вместо создания и выбрасывания в горячем цикле.

export interface Pool<T> {
  /** Сколько объектов в пуле всего. */
  readonly capacity: number;
  /** Сколько сейчас свободно. */
  readonly free: number;
  /** Сколько сейчас занято. */
  readonly used: number;
  /** Сколько раз вызывалась фабрика. Для пула с постоянной ёмкостью — capacity. */
  readonly created: number;
  /** Сколько раз пул отказал: счётчик занижённой ёмкости. */
  readonly denied: number;
  /** Взять объект; пустой пул — ошибка проектирования, а не штатный случай. */
  acquire(): T;
  /** Взять объект, если он есть: для того, что не жалко пропустить (искры, следы). */
  tryAcquire(): T | null;
  release(item: T): void;
}

export function createPool<T>(
  create: () => T,
  reset: (item: T) => void,
  capacity: number,
): Pool<T> {
  // Весь запас создаётся сразу: в цикле кадра фабрика больше не вызывается.
  const items: T[] = [];
  for (let i = 0; i < capacity; i += 1) {
    items.push(create());
  }

  let created = capacity;
  let denied = 0;

  return {
    capacity,

    get free() {
      return items.length;
    },

    get used() {
      return capacity - items.length;
    },

    get created() {
      return created;
    },

    get denied() {
      return denied;
    },

    acquire() {
      const item = items.pop();
      if (item === undefined) {
        denied += 1;
        throw new RangeError(`пул исчерпан: ёмкость ${capacity}`);
      }
      return item;
    },

    tryAcquire() {
      const item = items.pop();
      if (item === undefined) {
        denied += 1;
        return null;
      }
      return item;
    },

    release(item) {
      // Возвращаемый объект чистится здесь, а не при выдаче: занятые поля
      // не переживают возврат и не всплывают в следующем владельце.
      reset(item);
      items.push(item);
    },
  };
}
