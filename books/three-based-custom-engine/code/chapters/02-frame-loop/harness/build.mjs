// Сборка страницы стенда: один вход, один файл на выходе.
import * as esbuild from 'esbuild';

export const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'web/bundle.js',
  sourcemap: true,
  logLevel: 'info',
};

if (import.meta.main) {
  await esbuild.build(buildOptions);
}
