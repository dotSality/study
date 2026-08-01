// Слой 2: цикл кадра в настоящем браузере.
// Детерминированные прогоны идут виртуальным временем; отдельный тест смотрит,
// что делает с кадрами сам браузер, когда вкладка уходит на задний план.
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
const LAUNCH = {
  channel: 'chrome',
  headless: true,
  args: [
    // Эталонный контур: программный растеризатор вместо видеокарты.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--force-color-profile=srgb',
    '--hide-scrollbars',
  ],
};

async function withPage(run, { standDriven = true } = {}) {
  await esbuild.build({ ...buildOptions, logLevel: 'silent' });
  const stand = await startStandServer('web');
  const browser = await chromium.launch(LAUNCH);
  const errors = [];
  const warnings = [];
  try {
    // Контекст создаётся явно: тесту про скрытую вкладку нужна вторая страница
    // в том же контексте, а неявный контекст browser.newPage() их не допускает.
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

    await page.goto(standDriven ? `${stand.url}?stand=1` : stand.url, { waitUntil: 'load' });
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

test('virtual time: 61 frames of one step produce 60 steps and one draw call per frame', async () => {
  const { report, errors, warnings } = await withPage(async (page, browser, console_) => {
    const report = await page.evaluate(
      ([frames, stepMs]) => window.stand.runVirtual(frames, stepMs),
      [61, STEP_MS],
    );
    return { report: { browser: browser.version(), ...report }, ...console_ };
  });

  save('frame-loop-virtual.json', { ...report, errors, warnings });

  const unexpected = warnings.filter((w) => !EXPECTED_WARNINGS.some((known) => w.includes(known)));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert.equal(report.frames, 61);
  assert.equal(report.steps, 60);
  assert.equal(report.info.frame, 61);
  // Один куб — один вызов отрисовки и двенадцать треугольников в последнем кадре.
  assert.equal(report.info.calls, 1);
  assert.equal(report.info.triangles, 12);
  assert.equal(report.info.geometries, 1);
  assert.deepEqual(report.centerPixel, [255, 128, 64, 255]);
  // Кадры ровно по шагу: остатка нет, интерполировать нечего.
  assert.ok(report.alpha < 1e-9);
  assert.ok(Math.abs(report.gameMs - 60 * STEP_MS) < 1e-9);
});

test('virtual time: 20 ms frames keep the simulation on its own step grid', async () => {
  const report = await withPage(async (page) =>
    page.evaluate(([frames, stepMs]) => window.stand.runVirtual(frames, stepMs), [60, 20]),
  );

  save('frame-loop-grid.json', report);

  // 59 дельт по 20 мс = 1180 мс; шаг 16,666… мс → 70 шагов и 13,33 мс в остатке.
  assert.equal(report.frames, 60);
  assert.equal(report.steps, 70);
  assert.ok(Math.abs(report.alpha - 0.8) < 1e-6);
  // Отрисовка интерполирует: угол лежит между двумя последними шагами.
  assert.ok(report.rotationY < report.simulatedY);
  assert.ok(report.rotationY > report.simulatedY - Math.PI / 60);
});

test('virtual time: a paused clock freezes the simulation while frames keep coming', async () => {
  const report = await withPage(async (page) => {
    await page.evaluate(() => window.stand.runVirtual(11, 1000 / 60));
    await page.evaluate(() => window.stand.setPaused(true));
    return page.evaluate(() => window.stand.runVirtual(20, 1000 / 60));
  });

  save('frame-loop-paused.json', report);

  assert.equal(report.paused, true);
  assert.equal(report.frames, 31);
  assert.equal(report.steps, 10);
});

test('real time: requestAnimationFrame drives the loop, and the contour cannot hide a tab', async () => {
  const measurement = await withPage(
    async (page, browser) => {
      const context = page.context();
      await page.waitForTimeout(500);
      const first = await page.evaluate(() => window.stand.report());

      // Вторая вкладка выходит на передний план. В настоящем браузере первая
      // стала бы скрытой и кадры бы прекратились; проверяем, что делает контур.
      const other = await context.newPage();
      await other.goto('about:blank');
      await other.bringToFront();
      await page.waitForTimeout(500);
      const behind = await page.evaluate(() => ({
        state: document.visibilityState,
        frames: window.stand.report().frames,
      }));

      return {
        browser: browser.version(),
        framesWhileVisible: first.frames,
        realMs: first.realMs,
        stateBehindAnotherTab: behind.state,
        framesBehindAnotherTab: behind.frames,
      };
    },
    { standDriven: false },
  );

  save('frame-loop-visibility.json', measurement);

  // Кадры действительно идут сами: цикл живёт на requestAnimationFrame.
  assert.ok(measurement.framesWhileVisible > 0);
  assert.ok(measurement.realMs > 0);
  // Ограничение эталонного контура, закреплённое тестом: страница остаётся
  // видимой, даже когда впереди другая вкладка, поэтому остановку кадров в
  // фоне здесь проверить нельзя — это пункт ручной приёмки (задание Г2.Ч1.З8).
  // Если Chrome это изменит, тест упадёт, и главу нужно будет обновить.
  assert.equal(measurement.stateBehindAnotherTab, 'visible');
  assert.ok(measurement.framesBehindAnotherTab > measurement.framesWhileVisible);
});
