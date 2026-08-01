// Измерение, а не тест: во что обходится кадр собранного ядра, если гонять его
// долго. Сцена та же, что на стенде, но без моста к three.js — ядро работает
// в Node, и это само по себе проверка того, что рендер в него не врос.
//
// Числа сборок мусора в критерий приёмки не входят (§4.1 операционного
// документа): они плавают. Входит тождество объектов — оно в tests/hot-loop.test.mjs.
import { PerformanceObserver } from 'node:perf_hooks';
import { createEngine, createManualSource, createVectorStore, createComponentStore, addChild, createSceneNode, setLocalPosition } from '../src/engine/index.ts';

/** Сколько кадров прогнать. Больше кадров — виднее, растёт ли что-нибудь линейно. */
const FRAMES = Number(process.argv[2] ?? 10_000);
const WARMUP = 200;
const STEP_MS = 1000 / 60;
const CAPACITY = 32;
const BODY_COUNT = 12;
const BOUND = 3;

const collections = [];
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    collections.push({ startTime: entry.startTime, duration: entry.duration });
  }
});
observer.observe({ entryTypes: ['gc'] });

const source = createManualSource(0);
const engine = createEngine({ source, config: { capacity: CAPACITY, eventCapacity: 64 } });

const position = createVectorStore({ name: 'position', capacity: CAPACITY, entityCapacity: CAPACITY });
const velocity = createVectorStore({ name: 'velocity', capacity: CAPACITY, entityCapacity: CAPACITY });
const health = createComponentStore({
  name: 'health',
  capacity: CAPACITY,
  entityCapacity: CAPACITY,
  create: () => ({ current: 0, max: 0 }),
  reset: (value) => {
    value.current = 1_000_000;
    value.max = 1_000_000;
  },
});
engine.addStore(position);
engine.addStore(velocity);
engine.addStore(health);

const bodyNodes = [];
for (let i = 0; i < CAPACITY; i += 1) {
  const node = createSceneNode(`body-${i}`);
  addChild(engine.root, node);
  bodyNodes.push(node);
}

for (let i = 0; i < BODY_COUNT; i += 1) {
  const entity = engine.spawn();
  const angle = (i / BODY_COUNT) * Math.PI * 2;
  position.add(entity, Math.cos(angle) * 2, Math.sin(angle) * 2, 0);
  velocity.add(entity, Math.cos(angle) * 1.4, Math.sin(angle) * 1.4, 0);
  health.add(entity);
}

engine.addSystem({
  name: 'motion',
  phase: 'fixed',
  order: 0,
  update() {
    const dt = STEP_MS / 1000;
    const size = position.size;
    for (let i = 0; i < size; i += 1) {
      const x = position.x[i] + velocity.x[i] * dt;
      const y = position.y[i] + velocity.y[i] * dt;
      if (x > BOUND || x < -BOUND) velocity.x[i] = -velocity.x[i];
      else position.x[i] = x;
      if (y > BOUND || y < -BOUND) velocity.y[i] = -velocity.y[i];
      else position.y[i] = y;
    }
  },
});

engine.addSystem({
  name: 'chatter',
  phase: 'fixed',
  order: 1,
  update(frame) {
    // Каждый шаг рождает событие: доставка тоже должна обходиться без мусора.
    engine.events.post(1, position.owners[0], 1, 0, 0, frame.gameMs);
  },
});

engine.events.subscribe(1, (event) => {
  const hp = health.get(event.target);
  if (hp !== null) hp.current -= event.a;
});

engine.addSystem({
  name: 'sync',
  phase: 'update',
  order: 0,
  update() {
    const size = position.size;
    for (let i = 0; i < size; i += 1) {
      setLocalPosition(bodyNodes[i], position.x[i], position.y[i], position.z[i]);
    }
  },
});

// Разогрев: первые кадры компилируются и раскладываются, мерить их бессмысленно.
for (let i = 0; i <= WARMUP; i += 1) engine.tick(i * STEP_MS);

// Живая куча меряется после принудительной сборки (нужен флаг --expose-gc):
// без неё в замер попадает молодой мусор, ещё не убранный сборщиком.
global.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const from = performance.now();
for (let i = WARMUP + 1; i <= FRAMES; i += 1) engine.tick(i * STEP_MS);
const to = performance.now();
const heapDirty = process.memoryUsage().heapUsed;
global.gc?.();
const heapAfter = process.memoryUsage().heapUsed;

await new Promise((resolve) => setTimeout(resolve, 200));

const measured = FRAMES - WARMUP;
const inside = collections.filter((gc) => gc.startTime >= from && gc.startTime <= to);
const report = engine.report();

console.log(`кадров всего: ${report.frame}, из них измерено: ${measured}`);
console.log(`шагов симуляции: ${report.steps}, событий доставлено: ${report.events.delivered}`);
console.log(`обходов графа: ${report.graph.traversals}, посещений узлов: ${report.graph.visited}`);
console.log(`сущностей живо: ${report.entities.alive}, создано за прогон: ${report.entities.created}`);
console.log(`сборок мусора в окне измерения: ${inside.length}`);
console.log(
  `живая куча: ${(heapBefore / 1024).toFixed(0)} КиБ → ${(heapAfter / 1024).toFixed(0)} КиБ ` +
    `(${(((heapAfter - heapBefore) / measured) * 1000).toFixed(1)} Б на тысячу кадров)`,
);
console.log(`куча до уборки: ${(heapDirty / 1024).toFixed(0)} КиБ`);
