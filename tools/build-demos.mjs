// Builds the three ready-made cities once and writes each as a save file under public/demo/,
// so the game can open one at once instead of living through its years of history in the
// player's browser. Run by `npm run build`; the files are not kept in the repository.
// Without them (as in `npm run dev` before a first build) the game builds the city itself.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const bundle = 'node_modules/.cache/demo-builder.mjs';
await build({
  stdin: {
    contents: `
      import { demoCity } from './src/app/demoCity';
      import { SimulationEngine } from './src/simulation/SimulationEngine';
      export function make(size) {
        const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
        demoCity(engine, size);
        return engine.save();
      }`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error',
});
const { make } = await import(pathToFileURL(bundle).href);
mkdirSync('public/demo', { recursive: true });
for (const size of ['small', 'medium', 'large']) {
  const started = Date.now();
  // The map's tiles are bytes, which JSON has no word for: written as a list, read back as bytes by the game.
  const text = JSON.stringify(make(size), (_key, value) => value instanceof Uint8Array ? [...value] : value);
  writeFileSync(`public/demo/${size}.json`, text);
  console.log(`demo ${size}: ${(text.length / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
