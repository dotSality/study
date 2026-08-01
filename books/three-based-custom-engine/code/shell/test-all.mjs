// Прогон проверок всех состояний движка: в каждом каталоге главы запускается
// её собственный `node --test` — ровно та команда, что напечатана в книге.
// Тесты старых глав остаются в строю и ловят регрессии.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { CHAPTERS } from './chapters.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
let failed = 0;

for (const chapter of CHAPTERS) {
  console.log(`\n=== ${chapter.number} · ${chapter.title} (${chapter.id}) ===`);
  const result = spawnSync(process.execPath, ['--test'], {
    cwd: path.join(root, 'chapters', chapter.id),
    stdio: 'inherit',
  });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\nглав с падениями: ${failed}`);
  process.exit(1);
}
