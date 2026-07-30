// Сборка всех состояний движка в одну страницу-стенд с переключателем глав.
// Каждая глава собирается своим harness/build.mjs — тем самым, что напечатан в книге;
// оболочка только подставляет рабочий каталог и имя выходного файла.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { CHAPTERS } from './chapters.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');

export async function buildAll() {
  fs.mkdirSync(webDir, { recursive: true });
  const built = [];

  for (const chapter of CHAPTERS) {
    const chapterDir = path.join(root, 'chapters', chapter.id);
    const buildModule = url.pathToFileURL(path.join(chapterDir, 'harness', 'build.mjs'));
    const { buildOptions } = await import(buildModule.href);
    const outfile = path.join(webDir, `${chapter.id}.js`);

    const result = await esbuild.build({
      ...buildOptions,
      absWorkingDir: chapterDir,
      outfile,
      logLevel: 'silent',
      metafile: true,
    });

    const bytes = Object.values(result.metafile.outputs).find((o) => o.entryPoint !== undefined);
    built.push({ chapter, bytes: bytes?.bytes ?? 0 });
  }

  const template = fs.readFileSync(path.join(root, 'shell', 'index.html'), 'utf8');
  const page = template.replace('/*CHAPTERS*/', JSON.stringify(CHAPTERS, null, 2));
  fs.writeFileSync(path.join(webDir, 'index.html'), page);

  return built;
}

if (import.meta.main) {
  const built = await buildAll();
  for (const { chapter, bytes } of built) {
    console.log(`  web/${chapter.id}.js  ${(bytes / 1024 / 1024).toFixed(1)}mb`);
  }
  console.log(`  web/index.html  ${built.length} состояний движка`);
}
