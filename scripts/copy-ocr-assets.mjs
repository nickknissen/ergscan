import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const versionOf = (pkg) => JSON.parse(readFileSync(join(modules, pkg, 'package.json'), 'utf8')).version;
const version = `${versionOf('tesseract.js')}-${versionOf('tesseract.js-core')}`;
rmSync(join(root, 'public', 'tesseract'), { recursive: true, force: true });
const target = join(root, 'public', 'tesseract', version);

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

for (const [from, to] of files) {
  const dest = join(target, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(modules, from), dest);
}
console.log(`Copied ${files.length} OCR assets to public/tesseract/${version}`);
