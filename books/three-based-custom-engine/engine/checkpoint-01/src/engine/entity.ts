// Реестр сущностей. Сущность движка — это число, а не объект: индекс места
// в реестре и поколение этого места, упакованные в один дескриптор. Всё, что
// сущность «умеет», лежит в хранилищах компонентов, а не в ней самой.

/** Дескриптор сущности: индекс и поколение в одном 32-битном числе. */
export type Entity = number;

/** Разрядность индекса: сколько мест различает реестр. */
export const INDEX_BITS = 20;
/** Разрядность поколения: сколько раз место переиспользуется до повтора. */
export const GENERATION_BITS = 12;

/** Наибольший индекс, который реестр вправе выдать. */
export const MAX_INDEX = (1 << INDEX_BITS) - 2;
/** Наибольшее поколение; следующее за ним — снова нулевое. */
export const MAX_GENERATION = (1 << GENERATION_BITS) - 1;

const INDEX_MASK = (1 << INDEX_BITS) - 1;

/**
 * Дескриптор, который реестр не выдаёт никогда: его индекс на единицу больше
 * наибольшего разрешённого. Поэтому «ничья сущность» — не особый случай
 * проверки, а обычное число, не совпадающее ни с одним живым.
 */
export const NO_ENTITY: Entity = 0xffffffff;

/**
 * Собрать дескриптор из индекса и поколения. Сдвиг в JavaScript работает над
 * 32-битным знаковым числом, поэтому поколение от 2048 уводит результат
 * в отрицательные; `>>> 0` возвращает его в беззнаковый диапазон.
 */
export function makeEntity(index: number, generation: number): Entity {
  return (((generation & MAX_GENERATION) << INDEX_BITS) | (index & INDEX_MASK)) >>> 0;
}

export function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK;
}

export function entityGeneration(entity: Entity): number {
  return entity >>> INDEX_BITS;
}

/** Счётчики реестра. Воспроизводятся от прогона к прогону одинаково. */
export interface EntityStats {
  /** Сколько сущностей создано с начала работы. */
  created: number;
  /** Сколько уничтожено. */
  destroyed: number;
  /** Сколько создано на освободившемся месте, а не на новом. */
  reused: number;
  /** Сколько раз реестр отказал из-за исчерпанной ёмкости. */
  denied: number;
  /** Сколько раз место прошло полный круг поколений. */
  wrapped: number;
}

export interface EntityRegistry {
  readonly capacity: number;
  /** Сколько сущностей живо сейчас. */
  readonly alive: number;
  /** Сколько мест реестра хоть раз занималось. */
  readonly used: number;
  readonly stats: EntityStats;
  create(): Entity;
  destroy(entity: Entity): boolean;
  isAlive(entity: Entity): boolean;
  reset(): void;
}

export function createEntityRegistry(capacity: number): EntityRegistry {
  if (capacity < 1 || capacity > MAX_INDEX + 1) {
    throw new RangeError(`capacity out of range: ${capacity}`);
  }

  // Поколение каждого места. Двенадцать разрядов помещаются в Uint16Array,
  // а массив постоянной длины не выделяет память в ходе работы.
  const generations = new Uint16Array(capacity);
  // Освободившиеся места, стек: последнее освобождённое занимается первым.
  const freeIndices = new Int32Array(capacity);
  let freeTop = 0;
  // Граница освоенного: места правее неё ещё ни разу не занимались.
  let used = 0;
  let alive = 0;

  const stats: EntityStats = { created: 0, destroyed: 0, reused: 0, denied: 0, wrapped: 0 };

  return {
    capacity,

    get alive() {
      return alive;
    },

    get used() {
      return used;
    },

    stats,

    create() {
      let index: number;
      if (freeTop > 0) {
        freeTop -= 1;
        index = freeIndices[freeTop];
        stats.reused += 1;
      } else if (used < capacity) {
        index = used;
        used += 1;
      } else {
        stats.denied += 1;
        throw new RangeError(`entity registry exhausted: capacity ${capacity}`);
      }
      alive += 1;
      stats.created += 1;
      return makeEntity(index, generations[index]);
    },

    destroy(entity) {
      const index = entity & INDEX_MASK;
      // Проверка поколения ловит уничтожение по устаревшему дескриптору:
      // такой дескриптор указывает на место, но не на его нынешнего жильца.
      if (index >= used || generations[index] !== entity >>> INDEX_BITS) {
        return false;
      }
      const next = generations[index] + 1;
      if (next > MAX_GENERATION) {
        // Круг поколений замкнулся: дескрипторы этого места, выданные
        // 4096 жильцов назад, снова станут считаться живыми.
        stats.wrapped += 1;
      }
      generations[index] = next & MAX_GENERATION;
      freeIndices[freeTop] = index;
      freeTop += 1;
      alive -= 1;
      stats.destroyed += 1;
      return true;
    },

    isAlive(entity) {
      const index = entity & INDEX_MASK;
      return index < used && generations[index] === entity >>> INDEX_BITS;
    },

    reset() {
      generations.fill(0);
      freeTop = 0;
      used = 0;
      alive = 0;
      stats.created = 0;
      stats.destroyed = 0;
      stats.reused = 0;
      stats.denied = 0;
      stats.wrapped = 0;
    },
  };
}
