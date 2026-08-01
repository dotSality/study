// Режим разработки: пересборка при правке файла плюс свой сервер.
import * as esbuild from 'esbuild';
import { createStandServer } from './server.mjs';
import { buildOptions } from './build.mjs';

const context = await esbuild.context({ ...buildOptions, logLevel: 'info' });
await context.watch();

const server = createStandServer('web');
server.listen(5173, '127.0.0.1', () => {
  console.log('stand: http://127.0.0.1:5173/index.html');
});
