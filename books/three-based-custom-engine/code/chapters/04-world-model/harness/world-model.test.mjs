// Слой 2: модель мира в настоящем браузере. Проверяется не картинка сама по
// себе, а согласие счётчиков: сколько сущностей живо, сколько событий доехало
// и сколько тел из-за этого видно на экране.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { startStandServer } from './server.mjs';
import { buildOptions } from './build.mjs';

const EXPECTED_WARNINGS = ['GPU stall due to ReadPixels'];
const OUT_DIR = 'harness/out';
const STEP_MS = 1000 / 60;
const FRAMES = 61;
const CAPACITY = 32;
const BODY_COUNT = 12;
/** Узлы графа: тела плюс корень, стойка камеры и сама камера. */
const NODES = CAPACITY + 3;
const LAUNCH = {
  channel: 'chrome',
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--force-color-profile=srgb',
    '--hide-scrollbars',
  ],
};

async function withPage(run) {
  await esbuild.build({ ...buildOptions, logLevel: 'silent' });
  const stand = await startStandServer('web');
  const browser = await chromium.launch(LAUNCH);
  const errors = [];
  const warnings = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.type() === 'warning') warnings.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(`${stand.url}?stand=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.stand !== undefined);
    return await run(page, browser, { errors, warnings });
  } finally {
    await browser.close();
    await stand.close();
  }
}

function save(name, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2));
}

function runVirtual(page, frames = FRAMES) {
  return page.evaluate(
    ([count, stepMs]) => window.stand.runVirtual(count, stepMs),
    [frames, STEP_MS],
  );
}

test('virtual time: the world stays consistent with itself', async () => {
  const { report, errors, warnings } = await withPage(async (page, browser, console_) => {
    const report = await runVirtual(page);
    return { report: { browser: browser.version(), ...report }, ...console_ };
  });

  save('world-model-virtual.json', { ...report, errors, warnings });

  const unexpected = warnings.filter((w) => !EXPECTED_WARNINGS.some((known) => w.includes(known)));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);

  assert.equal(report.frames, FRAMES);
  assert.equal(report.steps, FRAMES - 1);
  assert.equal(report.nodes, NODES);

  // Заведено BODY_COUNT сущностей; каждая либо жива, либо уничтожена.
  assert.equal(report.world.spawned, BODY_COUNT);
  assert.equal(report.entities.created, BODY_COUNT);
  assert.equal(report.entities.alive + report.entities.destroyed, BODY_COUNT);
  assert.equal(report.entities.reused, 0, 'nobody respawns in this scene');

  // Все хранилища ходят строем: у живой сущности есть все три компонента.
  assert.equal(report.stores.position, report.entities.alive);
  assert.equal(report.stores.velocity, report.entities.alive);
  assert.equal(report.stores.health, report.entities.alive);

  // Видно ровно живых — по мешу на плотное место.
  assert.equal(report.visibleMeshes, report.entities.alive);
  assert.equal(report.info.calls, report.entities.alive);
  assert.equal(report.info.geometries, 1, 'the geometry is shared');
});

test('virtual time: the event queue neither loses nor invents events', async () => {
  const report = await withPage((page) => runVirtual(page));

  save('world-model-events.json', report);

  // Каждое отправленное событие либо доставлено, либо ещё лежит в очереди.
  assert.equal(
    report.events.posted,
    report.events.delivered + report.events.queued + report.events.dropped,
  );
  assert.equal(report.events.dropped, 0, 'the queue was wide enough');
  assert.equal(report.events.unheard, 0, 'both event types have a listener');

  // Урона отправлено ровно столько, сколько насчитала система: шаг даёт одно
  // событие, каждый пятый шаг — ещё одно, отложенное.
  const steps = report.steps;
  assert.equal(report.sim.damageSent, steps + Math.floor(steps / 5));
  // Смерти рождают события из обработчика — они и есть отложенные.
  assert.equal(report.events.posted, report.sim.damageSent + report.events.deferred);
  assert.ok(report.events.deferred >= report.sim.deaths);
});

test('virtual time: a death removes the entity from every store at once', async () => {
  const report = await withPage((page) => runVirtual(page));

  save('world-model-deaths.json', report);

  assert.equal(report.world.despawned, report.sim.deaths);
  assert.equal(report.entities.destroyed, report.sim.deaths);
  assert.equal(report.entities.alive, BODY_COUNT - report.sim.deaths);
  // Очередь удалений опустошается каждый шаг, поэтому к концу кадра пусто.
  assert.equal(report.world.pending, 0);
  assert.equal(report.world.pendingPeak <= CAPACITY, true);
});

test('virtual time: the graph is still walked exactly once per frame', async () => {
  const report = await withPage((page) => runVirtual(page));

  save('world-model-graph.json', report);

  assert.equal(report.graph.traversals, FRAMES);
  assert.equal(report.graph.visited, FRAMES * NODES);
  // Узлы мёртвых тел перестают двигаться, поэтому пересчётов меньше, чем
  // кадров, помноженных на число узлов.
  assert.ok(report.graph.localRecomputed < FRAMES * NODES);
});

test('virtual time: the same frame number gives the same world', async () => {
  const [first, second] = await withPage(async (page) => {
    const one = await runVirtual(page);
    const two = await runVirtual(page);
    return [one, two];
  });

  save('world-model-determinism.json', { first, second });

  assert.deepEqual(second.entities, first.entities);
  assert.deepEqual(second.stores, first.stores);
  assert.deepEqual(second.events, first.events);
  assert.deepEqual(second.sim, first.sim);
  assert.deepEqual(second.centerPixel, first.centerPixel);
});
