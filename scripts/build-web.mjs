import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'web');
const shared = {
  bundle: true,
  minify: true,
  write: false,
  platform: 'browser',
  target: 'es2022',
  legalComments: 'none',
};

async function bundle(entry, options = {}) {
  const result = await build({ ...shared, entryPoints: [join(root, entry)], ...options });
  return result.outputFiles[0].text;
}

await mkdir(out, { recursive: true });

const player = await bundle('src/player/standalone.ts', {
  format: 'iife',
  globalName: 'FlipnotePlayerKit',
});
await writeFile(join(out, 'flipnote-player.js'), player);

console.log(`dist/web/flipnote-player.js: ${(player.length / 1024).toFixed(0)} KB`);
