// Builds the SDK: the typed ESM package (dist/*.js + *.d.ts), the script-tag bundle (dist/v1.js), and the package as a
// tarball (dist/living-textbook-sdk.tgz) that `npm install <url>` accepts. The server serves the last two at /sdk/.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });

await build({
  entryPoints: [path.join(root, 'src/browser.ts')], bundle: true, format: 'iife', target: 'es2018', minify: true,
  outfile: path.join(dist, 'v1.js'), legalComments: 'none',
  banner: { js: '/* Living Textbook embed SDK v1 · docs: /developers */' },
});

const out = execFileSync('npm', ['pack', '--pack-destination', dist, '--silent'], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
fs.copyFileSync(path.join(dist, out), path.join(dist, 'living-textbook-sdk.tgz'));
const kb = (f) => `${(fs.statSync(path.join(dist, f)).size / 1024).toFixed(1)} KB`;
console.log(`sdk: dist/index.js, dist/v1.js (${kb('v1.js')}), dist/living-textbook-sdk.tgz (${kb('living-textbook-sdk.tgz')})`);
