// Измерение, а не тест: во что обходятся временные объекты в горячем цикле.
// Считаются не миллисекунды кадра (они в критерии приёмки не входят, §1.3.1),
// а число созданных объектов и число сборок мусора, которые они вызвали.
//
// Записи о сборках мусора приходят асинхронно, а измеряемый цикл блокирует
// поток — поэтому сборки собираются со своими отметками времени и потом
// разносятся по окнам замеров.
import { PerformanceObserver } from 'node:perf_hooks';
import { createPool } from '../src/engine/pool.ts';

const ITERATIONS = 5_000_000;
/** Кольцо живых объектов: без него JIT выбрасывает аллокацию целиком. */
const RING = 64;

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
  const created = run();
  windows.push({ name, created, from, to: performance.now() });
}

// 1. Объект не покидает итерацию: V8 может не создавать его вовсе.
measure('временный объект, никуда не попадает', () => {
  let sum = 0;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const temporary = { x: i, y: i * 2, z: i * 3 };
    sum += temporary.x + temporary.y + temporary.z;
  }
  return sum === 0 ? 0 : ITERATIONS;
});

// 2. Тот же объект, но он живёт дальше итерации — как частица или событие.
measure('новый объект, попадает в кольцо живых', () => {
  const ring = new Array(RING).fill(null);
  for (let i = 0; i < ITERATIONS; i += 1) {
    ring[i % RING] = { x: i, y: i * 2, z: i * 3 };
  }
  return ring.length === RING ? ITERATIONS : ITERATIONS;
});

// 3. То же кольцо, но объекты берутся из пула и возвращаются при вытеснении.
measure('пул на кольцо живых', () => {
  const ring = new Array(RING).fill(null);
  const pool = createPool(
    () => ({ x: 0, y: 0, z: 0 }),
    (vector) => {
      vector.x = 0;
      vector.y = 0;
      vector.z = 0;
    },
    RING,
  );
  for (let i = 0; i < ITERATIONS; i += 1) {
    const slot = i % RING;
    const evicted = ring[slot];
    if (evicted !== null) pool.release(evicted);
    const fresh = pool.acquire();
    fresh.x = i;
    fresh.y = i * 2;
    fresh.z = i * 3;
    ring[slot] = fresh;
  }
  return pool.created;
});

// Даём наблюдателю доставить записи, накопившиеся за время замеров.
await new Promise((resolve) => setTimeout(resolve, 200));

console.log(`итераций: ${ITERATIONS.toLocaleString('ru-RU')}, кольцо живых объектов: ${RING}`);
for (const window of windows) {
  const inside = collections.filter((gc) => gc.startTime >= window.from && gc.startTime <= window.to);
  const totalMs = inside.reduce((sum, gc) => sum + gc.duration, 0);
  console.log(
    `${window.name.padEnd(38)} создано ${String(window.created).padStart(9)}, ` +
      `сборок мусора ${String(inside.length).padStart(3)} ` +
      `на ${totalMs.toFixed(1)} мс`,
  );
}
