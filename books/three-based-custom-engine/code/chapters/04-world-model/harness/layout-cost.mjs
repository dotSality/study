// Измерение, а не тест: во что обходится раскладка данных. Считаются число
// созданных объектов, сборки мусора и отношения времён внутри одного прогона.
// Абсолютные миллисекунды в критерии приёмки не входят (§1.3.1) — они здесь
// только для того, чтобы отношение было на что делить.
//
// Замеры разведены так, чтобы за раз менялось одно: сначала раскладка при
// одинаковом числе элементов, потом дыры при одинаковой раскладке.
import { PerformanceObserver } from 'node:perf_hooks';
import { createVectorStore } from '../src/engine/vector-store.ts';
import { createComponentStore } from '../src/engine/component-store.ts';
import { createEntityRegistry } from '../src/engine/entity.ts';

const COUNT = 100_000;
const HALF = COUNT / 2;
const PASSES = 200;

const collections = [];
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    collections.push({ startTime: entry.startTime, duration: entry.duration });
  }
});
observer.observe({ entryTypes: ['gc'] });

const windows = [];

function measure(name, run) {
  const from = performance.now();
  const result = run();
  windows.push({ name, result, from, to: performance.now() });
  return result;
}

/** Один и тот же проход по массиву объектов: читается единственное поле x. */
function sumObjects(items, size) {
  let sum = 0;
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (let i = 0; i < size; i += 1) {
      sum += items[i].x;
    }
  }
  return sum;
}

/** Тот же проход по сплошному массиву чисел. */
function sumNumbers(x, size) {
  let sum = 0;
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (let i = 0; i < size; i += 1) {
      sum += x[i];
    }
  }
  return sum;
}

// --- подготовка данных -------------------------------------------------------

// Игровой объект «как обычно»: поля разных видов, из которых проходу нужно одно.
const objects = new Array(COUNT);
for (let i = 0; i < COUNT; i += 1) {
  objects[i] = { x: i, y: i * 2, z: i * 3, alive: i % 2 === 0, name: `body-${i}` };
}

const registry = createEntityRegistry(COUNT);
const vectors = createVectorStore({ name: 'position', capacity: COUNT, entityCapacity: COUNT });
for (let i = 0; i < COUNT; i += 1) {
  vectors.add(registry.create(), i, i * 2, i * 3);
}

// Те же живые элементы, но уложенные подряд: объектами и числами.
const denseObjects = new Array(HALF);
for (let i = 0; i < HALF; i += 1) {
  denseObjects[i] = { x: i * 2, y: 0, z: 0, alive: true, name: `body-${i * 2}` };
}
const packedRegistry = createEntityRegistry(HALF);
const packed = createVectorStore({ name: 'packed', capacity: HALF, entityCapacity: HALF });
for (let i = 0; i < HALF; i += 1) {
  packed.add(packedRegistry.create(), i * 2, 0, 0);
}

// --- 1. Раскладка при одинаковом числе элементов -----------------------------

const objectsAll = measure('объекты, все живые', () => sumObjects(objects, COUNT));
const numbersAll = measure('числа, все живые', () => sumNumbers(vectors.x, vectors.size));

// Тот же массив и тот же проход, но с чтением второго поля и ветвлением по нему.
// Флаг здесь истинен всегда: измеряется цена самой проверки, а не пропусков.
const alwaysAlive = new Array(COUNT);
for (let i = 0; i < COUNT; i += 1) {
  alwaysAlive[i] = { x: i, y: i * 2, z: i * 3, alive: true, name: `body-${i}` };
}
const objectsFlag = measure('объекты, проверка флага', () => {
  let sum = 0;
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (let i = 0; i < COUNT; i += 1) {
      if (alwaysAlive[i].alive) sum += alwaysAlive[i].x;
    }
  }
  return sum;
});

// --- 2. Дыры при одинаковой раскладке ----------------------------------------

const withHoles = measure('объекты с дырами и проверкой', () => {
  let sum = 0;
  const items = objects;
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (let i = 0; i < COUNT; i += 1) {
      if (items[i].alive) sum += items[i].x;
    }
  }
  return sum;
});
const objectsDense = measure('объекты без дыр', () => sumObjects(denseObjects, HALF));
const numbersDense = measure('числа без дыр', () => sumNumbers(packed.x, packed.size));

// --- 3. Обход хранилищ не выделяет память ------------------------------------

let created = 0;
const health = createComponentStore({
  name: 'health',
  capacity: 1024,
  entityCapacity: 1024,
  create: () => {
    created += 1;
    return { current: 0, max: 0 };
  },
  reset: (value) => {
    value.current = 4;
    value.max = 4;
  },
});
const churnRegistry = createEntityRegistry(1024);
const churn = [];
for (let i = 0; i < 1024; i += 1) {
  const entity = churnRegistry.create();
  churn.push(entity);
  health.add(entity);
}

const churned = measure('10 000 циклов «удалить — вернуть»', () => {
  for (let round = 0; round < 10_000; round += 1) {
    const entity = churn[round % churn.length];
    health.remove(entity);
    health.add(entity).current = round;
  }
  return created;
});

await new Promise((resolve) => setTimeout(resolve, 200));

function windowOf(name) {
  const found = windows.find((entry) => entry.name === name);
  const inside = collections.filter((gc) => gc.startTime >= found.from && gc.startTime <= found.to);
  return { ...found, ms: found.to - found.from, gc: inside.length };
}

console.log(`элементов ${COUNT.toLocaleString('ru-RU')}, живых ${HALF.toLocaleString('ru-RU')}, проходов ${PASSES}`);
for (const entry of windows) {
  const info = windowOf(entry.name);
  console.log(
    `${entry.name.padEnd(34)} ${info.ms.toFixed(1).padStart(8)} мс, ` +
      `сборок мусора ${String(info.gc).padStart(3)}`,
  );
}

const sumsMatch =
  objectsAll === numbersAll &&
  objectsAll === objectsFlag &&
  withHoles === objectsDense &&
  objectsDense === numbersDense;
console.log(`суммы совпали: ${sumsMatch}`);
console.log(
  `раскладка, 100 000 элементов — объекты / числа: ` +
    `${(windowOf('объекты, все живые').ms / windowOf('числа, все живые').ms).toFixed(2)}`,
);
console.log(
  `раскладка, 50 000 элементов — объекты / числа: ` +
    `${(windowOf('объекты без дыр').ms / windowOf('числа без дыр').ms).toFixed(2)}`,
);
console.log(
  `проверка флага — с проверкой / без, объекты, все живые: ` +
    `${(windowOf('объекты, проверка флага').ms / windowOf('объекты, все живые').ms).toFixed(2)}`,
);
console.log(
  `дыры — с проверкой / без дыр, объекты: ` +
    `${(windowOf('объекты с дырами и проверкой').ms / windowOf('объекты без дыр').ms).toFixed(2)}`,
);
console.log(
  `объектов создано за 10 000 циклов: ${churned}, ` +
    `сборок ${windowOf('10 000 циклов «удалить — вернуть»').gc}`,
);
