// Слой 2 контрольной точки 1: собранный движок в настоящем браузере.
// Здесь впервые появляется эталонный кадр — картинка, с которой все дальнейшие
// прогоны сверяются попиксельно. Рядом с кадром пишется JSON: версия браузера,
// версия three и счётчики слоя 1, при которых эталон снят.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { startStandServer } from './server.mjs';
import { buildOptions } from './build.mjs';

// Предупреждение, которое стенд вызывает сам: синхронное чтение пикселя
// останавливает конвейер, и драйвер об этом сообщает.
const EXPECTED_WARNINGS = ['GPU stall due to ReadPixels'];
const OUT_DIR = 'harness/out';
const SCENE = 'checkpoint-01-core';
const STEP_MS = 1000 / 60;
const FRAMES = 61;
const CAPACITY = 32;
const BODY_COUNT = 12;
/** Узлы графа: корень, тела, стойка камеры и сама камера. */
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

/**
 * Эталоны живут в книге, а не в проекте главы: они переживают и главу,
 * и очистку рабочего каталога. Корень книги ищется по её операционному
 * документу — так один и тот же сценарий работает и из `code/`, и из снимка.
 */
function referenceDir() {
  let dir = path.dirname(url.fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(dir, 'custom-three-based-engine-book.md'))) {
      const reference = path.join(dir, 'harness', 'reference');
      fs.mkdirSync(reference, { recursive: true });
      return reference;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('book root not found: harness/reference is unreachable');
}

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

/**
 * Сравнение двух PNG по пикселям, а не по байтам файла: одинаковую картинку
 * можно закодировать по-разному, поэтому равенство файлов — достаточное
 * условие, но не необходимое. Раскодировать умеет сам браузер.
 */
function comparePixels(page, referencePng, shotPng) {
  return page.evaluate(
    async ([a, b]) => {
      const decode = async (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };

      const one = await decode(a);
      const two = await decode(b);
      if (one.width !== two.width || one.height !== two.height) {
        return {
          sizeMismatch: true,
          reference: { width: one.width, height: one.height },
          shot: { width: two.width, height: two.height },
        };
      }

      let differing = 0;
      let maxChannel = 0;
      for (let i = 0; i < one.data.length; i += 4) {
        let worst = 0;
        for (let c = 0; c < 4; c += 1) {
          const delta = Math.abs(one.data[i + c] - two.data[i + c]);
          if (delta > worst) worst = delta;
        }
        if (worst > 0) {
          differing += 1;
          if (worst > maxChannel) maxChannel = worst;
        }
      }
      return {
        sizeMismatch: false,
        width: one.width,
        height: one.height,
        pixels: one.width * one.height,
        differing,
        maxChannel,
      };
    },
    [referencePng.toString('base64'), shotPng.toString('base64')],
  );
}

test('checkpoint 1: the assembled engine agrees with its own counters', async () => {
  const { report, errors, warnings } = await withPage(async (page, browser, console_) => {
    const report = await runVirtual(page);
    return { report: { browser: browser.version(), ...report }, ...console_ };
  });

  save('checkpoint-01-counters.json', { ...report, errors, warnings });

  const unexpected = warnings.filter((w) => !EXPECTED_WARNINGS.some((known) => w.includes(known)));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);

  const engine = report.engine;
  assert.equal(engine.frame, FRAMES);
  assert.equal(engine.steps, FRAMES - 1);
  assert.equal(engine.gameMs, (FRAMES - 1) * STEP_MS);

  // Ядро расставило свои системы, сцена добавила свои.
  assert.deepEqual(engine.systems, { input: 0, fixed: 4, update: 2, render: 1 });
  assert.equal(engine.subsystems, 1, 'the bridge to three.js is the only subsystem');
  assert.equal(engine.world.stores, 3);

  // Слой 1, критерий приёмки: один обход графа за кадр и расчётное число узлов.
  assert.equal(engine.graph.nodes, NODES);
  assert.equal(engine.graph.traversals, FRAMES);
  assert.equal(engine.graph.visited, FRAMES * NODES);

  assert.equal(engine.world.spawned, BODY_COUNT);
  assert.equal(engine.entities.created, BODY_COUNT);
  assert.equal(engine.entities.alive + engine.entities.destroyed, BODY_COUNT);
  assert.equal(report.stores.position, engine.entities.alive);
  assert.equal(report.stores.velocity, engine.entities.alive);
  assert.equal(report.stores.health, engine.entities.alive);
  assert.equal(report.visibleMeshes, engine.entities.alive);
  assert.equal(report.info.calls, engine.entities.alive);
  assert.equal(report.info.geometries, 1, 'the geometry is shared');

  // Очередь событий ничего не потеряла и ничего не выдумала.
  assert.equal(
    engine.events.posted,
    engine.events.delivered + engine.events.queued + engine.events.dropped,
  );
  assert.equal(engine.events.dropped, 0);
  assert.equal(engine.events.unheard, 0);
});

test('checkpoint 1: the frame is a function of its number', async () => {
  const [first, second] = await withPage(async (page) => {
    const one = await runVirtual(page);
    const two = await runVirtual(page);
    return [one, two];
  });

  save('checkpoint-01-determinism.json', { first, second });

  // Совпадает всё, а не только состояние мира: счётчики обхода графа тоже
  // входят в кадр, и именно на них ловится незавершённый сброс.
  const withoutRendererLifetime = (report) => ({
    ...report,
    info: { ...report.info, frame: null },
  });
  assert.deepEqual(withoutRendererLifetime(second), withoutRendererLifetime(first));

  // Единственное исключение — `renderer.info.render.frame`: это счётчик вызовов
  // `render()` за всю жизнь рендерера, и сбросить его нечем (в 0.185.1
  // `info.reset()` обнуляет вызовы, треугольники, точки и линии, но не его).
  // Движок его не сбрасывает и в сверку с эталоном не берёт.
  assert.equal(second.info.frame, first.info.frame + FRAMES);
});

test('checkpoint 1: 60 frames of the deterministic scene match the reference', async () => {
  const directory = referenceDir();
  const referencePng = path.join(directory, `${SCENE}.png`);
  const referenceJson = path.join(directory, `${SCENE}.json`);
  const refresh = process.env.REFERENCE === 'refresh';
  const exists = fs.existsSync(referencePng) && fs.existsSync(referenceJson);
  const capture = refresh || !exists;
  const reference = exists ? fs.readFileSync(referencePng) : null;

  const result = await withPage(async (page, browser, console_) => {
    const report = await runVirtual(page);
    const shot = await page.locator('#view').screenshot();
    const stamp = {
      scene: SCENE,
      browser: browser.version(),
      three: report.three,
      frames: FRAMES,
      stepMs: STEP_MS,
      counters: {
        steps: report.engine.steps,
        nodes: report.engine.graph.nodes,
        traversals: report.engine.graph.traversals,
        visited: report.engine.graph.visited,
        alive: report.engine.entities.alive,
        calls: report.info.calls,
        triangles: report.info.triangles,
        geometries: report.info.geometries,
        programs: report.info.programs,
        centerPixel: report.centerPixel,
      },
    };
    // Сравнение идёт в той же вкладке, что и прогон: раскодировать PNG умеет
    // браузер, и лишний его запуск ради этого не нужен.
    const diff = capture || reference === null ? null : await comparePixels(page, reference, shot);
    return { shot, stamp, diff, ...console_ };
  });

  const unexpected = result.warnings.filter(
    (w) => !EXPECTED_WARNINGS.some((known) => w.includes(known)),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(unexpected, []);

  if (capture) {
    fs.writeFileSync(referencePng, result.shot);
    fs.writeFileSync(referenceJson, `${JSON.stringify(result.stamp, null, 2)}\n`);
    save('checkpoint-01-frame.json', { captured: true, ...result.stamp });
    // Снятый эталон нельзя сверить с самим собой, а молча принять кадр —
    // значит объявить проверку пройденной, не проверив ничего.
    assert.fail(
      `reference for ${SCENE} captured (${result.shot.length} bytes); run the scenario again to compare against it`,
    );
  }

  const stored = JSON.parse(fs.readFileSync(referenceJson, 'utf8'));
  const identicalBytes = reference.equals(result.shot);
  save('checkpoint-01-frame.json', {
    captured: false,
    identicalBytes,
    diff: result.diff,
    stored,
    current: result.stamp,
  });

  // Расхождение кадров при неизменной версии браузера — ошибка движка;
  // расхождение вместе с версией — повод переснять эталон осознанно
  // (REFERENCE=refresh) и записать это в журнал: конвенция 3.1 программы.
  assert.equal(
    result.stamp.browser,
    stored.browser,
    'browser version drifted: rerun with REFERENCE=refresh and record it in the journal',
  );
  assert.equal(result.stamp.three, stored.three);
  assert.deepEqual(result.stamp.counters, stored.counters);
  assert.equal(result.diff.sizeMismatch, false);
  assert.equal(
    result.diff.differing,
    0,
    `${result.diff.differing} of ${result.diff.pixels} pixels differ, worst channel ${result.diff.maxChannel}`,
  );
});
