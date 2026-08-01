// Слой 2: страница поднимается в настоящем браузере, кадр и счётчики сверяются.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { startStandServer } from './server.mjs';
import { buildOptions } from './build.mjs';

// Предупреждение, которое стенд вызывает сам: синхронное чтение пикселя
// останавливает конвейер, и драйвер об этом сообщает.
const EXPECTED_WARNINGS = ['GPU stall due to ReadPixels'];
const OUT_DIR = 'harness/out';

test('first frame: empty scene 640x360', async () => {
  await esbuild.build({ ...buildOptions, logLevel: 'silent' });

  const stand = await startStandServer('web');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      // Эталонный контур: программный растеризатор вместо видеокарты.
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
    ],
  });

  const errors = [];
  const warnings = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.type() === 'warning') warnings.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(stand.url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.standReport !== undefined);
    const report = await page.evaluate(() => window.standReport);

    // Отчёт пишется на диск ДО ассертов: упавший тест не должен уносить данные.
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUT_DIR, 'first-frame.json'),
      JSON.stringify({ browser: browser.version(), ...report, errors, warnings }, null, 2),
    );
    await page.locator('#view').screenshot({ path: path.join(OUT_DIR, 'first-frame.png') });

    const unexpected = warnings.filter((w) => !EXPECTED_WARNINGS.some((known) => w.includes(known)));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.equal(report.webgl2, true);
    assert.equal(report.crossOriginIsolated, true);
    assert.equal(report.actual.width, report.requested.width);
    assert.equal(report.actual.height, report.requested.height);
    assert.equal(report.cssSize.width, 640);
    assert.equal(report.cssSize.height, 360);
    // Пустая сцена: рисовать нечего, но кадр состоялся и залит цветом фона.
    assert.equal(report.info.calls, 0);
    assert.equal(report.info.triangles, 0);
    assert.equal(report.info.frame, 1);
    assert.deepEqual(report.centerPixel, [16, 24, 32, 255]);
  } finally {
    await browser.close();
    await stand.close();
  }
});
