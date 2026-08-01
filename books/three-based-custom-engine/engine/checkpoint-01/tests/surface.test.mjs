// Архитектурные проверки: не мнение о качестве кода, а бинарные факты о нём.
// Читается не поведение, а сами файлы — граф импортов, точка входа, побочные
// эффекты при загрузке модуля. Раздел 4.3 операционного документа разрешает
// в критерии приёмки только такие проверки.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..', 'src');
const engineDir = path.join(srcDir, 'engine');
const ENTRY = path.join(engineDir, 'index.ts');

/** Все файлы движка: каждый `.ts` под `src`, без сборок и без тестов. */
function collect(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found.sort();
}

/** Пути, на которые ссылается файл. Внешние пакеты (three) отбрасываются. */
function localImports(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specifiers = [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((match) => match[1]);
  return specifiers
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => path.resolve(path.dirname(file), specifier));
}

const files = collect(srcDir);

test('the engine layer does not know about the layers above it', () => {
  const outside = [];
  for (const file of files) {
    if (!file.startsWith(engineDir)) continue;
    for (const target of localImports(file)) {
      if (!target.startsWith(engineDir)) {
        outside.push(`${path.relative(srcDir, file)} -> ${path.relative(srcDir, target)}`);
      }
    }
  }
  // Ядро не импортирует ни мост к three.js, ни сцену стенда: иначе проверки
  // слоя 3 не смогли бы гонять его в Node, где рендерера нет.
  assert.deepEqual(outside, []);
});

test('everything above the engine reaches it only through the entry point', () => {
  const bypass = [];
  for (const file of files) {
    if (file.startsWith(engineDir)) continue;
    for (const target of localImports(file)) {
      if (target.startsWith(engineDir) && target !== ENTRY) {
        bypass.push(`${path.relative(srcDir, file)} -> ${path.relative(srcDir, target)}`);
      }
    }
  }
  assert.deepEqual(bypass, []);
});

test('no module of the engine imports the entry point', () => {
  const backwards = [];
  for (const file of files) {
    if (!file.startsWith(engineDir) || file === ENTRY) continue;
    if (localImports(file).includes(ENTRY)) backwards.push(path.relative(srcDir, file));
  }
  // Точка входа собирает поверхность для внешнего мира. Стоит модулю ядра
  // импортировать её, и в графе появляется цикл длиной два.
  assert.deepEqual(backwards, []);
});

test('the import graph has no cycles', () => {
  const visiting = new Set();
  const done = new Set();
  const cycles = [];

  function walk(file, stack) {
    if (done.has(file)) return;
    if (visiting.has(file)) {
      const from = stack.indexOf(file);
      cycles.push(stack.slice(from).concat(file).map((f) => path.relative(srcDir, f)).join(' -> '));
      return;
    }
    visiting.add(file);
    for (const target of localImports(file)) {
      if (files.includes(target)) walk(target, stack.concat(file));
    }
    visiting.delete(file);
    done.add(file);
  }

  for (const file of files) walk(file, []);
  assert.deepEqual(cycles, []);
});

test('the conformance adapter imports the entry point and nothing else', () => {
  const adapter = path.join(here, 'adapter.mjs');
  const targets = localImports(adapter);
  assert.deepEqual(
    targets.map((target) => path.relative(srcDir, target)),
    [path.relative(srcDir, ENTRY)],
  );
});

test('every module of the engine is represented in the entry point', () => {
  const entryText = fs.readFileSync(ENTRY, 'utf8');
  const missing = [];
  for (const file of files) {
    if (!file.startsWith(engineDir) || file === ENTRY) continue;
    const name = `./${path.basename(file)}`;
    if (!entryText.includes(`'${name}'`)) missing.push(name);
  }
  assert.deepEqual(missing, []);
});

test('loading the entry point has no side effects', async () => {
  const before = new Set(Object.keys(globalThis));
  const api = await import('../src/engine/index.ts');
  const added = Object.keys(globalThis).filter((key) => !before.has(key));
  // Модуль, который при загрузке заводит глобальное состояние, невозможно
  // проверить дважды в одном процессе и невозможно собрать в двух экземплярах.
  assert.deepEqual(added, []);

  const first = api.createEngine({ source: api.createManualSource(0), config: { capacity: 4 } });
  const second = api.createEngine({ source: api.createManualSource(0), config: { capacity: 4 } });
  first.spawn();
  assert.equal(first.report().entities.alive, 1);
  assert.equal(second.report().entities.alive, 0, 'two engines share no state');
});
