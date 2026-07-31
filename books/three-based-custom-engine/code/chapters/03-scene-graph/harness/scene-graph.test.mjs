// Слой 2: граф сцены в настоящем браузере.
// Прогон идёт виртуальным временем, поэтому кадр остаётся функцией своего номера.
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
const EPSILON = 1e-6;
const NODES = 10;
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

function assertClose(actual, expected, message, epsilon = 1e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: получено ${actual}, ожидалось ${expected}`,
  );
}

test('virtual time: one second of simulation puts the hierarchy where the arithmetic says', async () => {
  const { report, errors, warnings } = await withPage(async (page, browser, console_) => {
    const report = await page.evaluate(
      ([frames, stepMs]) => window.stand.runVirtual(frames, stepMs),
      [61, STEP_MS],
    );
    return { report: { browser: browser.version(), ...report }, ...console_ };
  });

  save('scene-graph-virtual.json', { ...report, errors, warnings });

  const unexpected = warnings.filter((w) => !EXPECTED_WARNINGS.some((known) => w.includes(known)));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);

  assert.equal(report.frames, 61);
  assert.equal(report.steps, 60);
  assert.equal(report.nodes, NODES);
  assert.ok(report.alpha < EPSILON, 'кадры ровно по шагу, остатка нет');

  // Шагов сделано 60, но alpha равна нулю, а отрисовка интерполирует между
  // предыдущим и текущим шагом — значит на экране состояние после 59 шагов.
  const PLANET_RADIANS_PER_STEP = (Math.PI * STEP_MS) / 1000;
  const shownSteps = report.steps - 1;
  const planetAngle = shownSteps * PLANET_RADIANS_PER_STEP;
  const moonAngle = shownSteps * PLANET_RADIANS_PER_STEP * 2;

  // Поворот вокруг оси y переводит (r, 0, 0) в (r·cos θ, 0, -r·sin θ).
  const expectedPlanet = [3 * Math.cos(planetAngle), 0, -3 * Math.sin(planetAngle)];
  // Луна смещена на единицу в системе координат планеты, а та повёрнута на
  // planetAngle, поэтому смещение разворачивается на сумму углов.
  const total = planetAngle + moonAngle;
  const expectedMoon = [
    expectedPlanet[0] + Math.cos(total),
    0,
    expectedPlanet[2] - Math.sin(total),
  ];

  const { sun, planet, moon } = report.worldPositions;
  assertClose(sun[0], 0, 'солнце, x');
  assertClose(sun[1], 0, 'солнце, y');
  assertClose(sun[2], 0, 'солнце, z');
  assertClose(planet[0], expectedPlanet[0], 'планета, x');
  assertClose(planet[1], expectedPlanet[1], 'планета, y');
  assertClose(planet[2], expectedPlanet[2], 'планета, z');
  assertClose(moon[0], expectedMoon[0], 'луна, x');
  assertClose(moon[1], expectedMoon[1], 'луна, y');
  assertClose(moon[2], expectedMoon[2], 'луна, z');

  // Планета прошла почти пол-оборота: она ушла на противоположную сторону.
  assert.ok(planet[0] < -2.9, `планета должна быть слева от солнца: ${planet[0]}`);
});

test('virtual time: the graph is walked exactly once per frame', async () => {
  const report = await withPage((page) =>
    page.evaluate(([frames, stepMs]) => window.stand.runVirtual(frames, stepMs), [61, STEP_MS]),
  );

  save('scene-graph-traversals.json', report);

  assert.equal(report.graph.traversals, 61, 'один обход на кадр');
  assert.equal(report.graph.visited, 61 * NODES, 'каждый обход посещает все узлы');
});

test('virtual time: only the moved subtree is recomputed after the first frame', async () => {
  const report = await withPage((page) =>
    page.evaluate(([frames, stepMs]) => window.stand.runVirtual(frames, stepMs), [61, STEP_MS]),
  );

  save('scene-graph-dirty.json', report);

  // Первый кадр считает всё; дальше двигаются два узла орбит, и мировые матрицы
  // пересчитываются только в поддереве орбиты планеты.
  const firstFrame = NODES;
  const laterFrames = 60;
  assert.equal(report.graph.localRecomputed, firstFrame + laterFrames * 2);
  assert.equal(report.graph.worldRecomputed, firstFrame + laterFrames * 6);
});

test('three does not walk its own graph: the matrices come from the engine', async () => {
  const report = await withPage((page) =>
    page.evaluate(([frames, stepMs]) => window.stand.runVirtual(frames, stepMs), [61, STEP_MS]),
  );

  save('scene-graph-three.json', report);

  assert.equal(report.threeAutoUpdate.scene, false);
  assert.equal(report.threeAutoUpdate.mesh, false);
  assert.equal(report.threeAutoUpdate.meshWorld, false);
  // Три тела — три вызова отрисовки, и картинка всё равно правильная.
  assert.equal(report.info.calls, 3);
  assert.equal(report.info.geometries, 1, 'геометрия у трёх тел общая');
  assert.equal(report.info.frame, 61);
});

test('virtual time: the same frame number gives the same frame', async () => {
  const [first, second] = await withPage(async (page) => {
    const one = await page.evaluate(
      ([frames, stepMs]) => window.stand.runVirtual(frames, stepMs),
      [61, STEP_MS],
    );
    const two = await page.evaluate(
      ([frames, stepMs]) => window.stand.runVirtual(frames, stepMs),
      [61, STEP_MS],
    );
    return [one, two];
  });

  save('scene-graph-determinism.json', { first, second });

  assert.deepEqual(second.worldPositions, first.worldPositions);
  assert.deepEqual(second.screenPositions, first.screenPositions);
  assert.deepEqual(second.centerPixel, first.centerPixel);
});

test('the space chain lands the sun in the middle of the viewport', async () => {
  const report = await withPage((page) =>
    page.evaluate(([frames, stepMs]) => window.stand.runVirtual(frames, stepMs), [61, STEP_MS]),
  );

  save('scene-graph-screen.json', report);

  // Солнце стоит в начале мира, камера смотрит на него, поэтому по горизонтали
  // оно ровно посередине кадра шириной 640 пикселей.
  assertClose(report.screenPositions.sun[0], 320, 'солнце по горизонтали', 1e-3);
  // Планета ушла в противоположную от старта сторону, значит и на экране она
  // слева от солнца.
  assert.ok(
    report.screenPositions.planet[0] < report.screenPositions.sun[0],
    `планета должна быть левее солнца: ${report.screenPositions.planet[0]}`,
  );
  // Глубина в NDC остаётся в пределах видимого объёма.
  assert.ok(report.screenPositions.sun[2] > 0 && report.screenPositions.sun[2] < 1);
});
