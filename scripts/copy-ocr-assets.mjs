import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// PP-OCRv6 tiny's models and dictionary (onnxruntime-web's WebAssembly is bundled by Vite). They come from
// Hugging Face at pinned revisions, checked by sha256 and kept in node_modules/.cache, so a build downloads them once.
const manifest = JSON.parse(readFileSync(join(root, 'src/ocr/ppocr/models.json'), 'utf8'));
const cache = join(modules, '.cache', 'ppocr');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function pinned({ url, sha256: want }) {
  const file = join(cache, want);
  if (existsSync(file) && sha256(readFileSync(file)) === want) return readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== want) throw new Error(`${url}: sha256 ${sha256(buf)}, expected ${want}`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

/** The `character_dict` list of the recogniser's inference.yml; its entries are plain or single-quoted. */
function dictFromYml(yml) {
  const lines = yml.split('\n');
  const dict = [];
  for (const line of lines.slice(lines.findIndex((l) => l.trim() === 'character_dict:') + 1)) {
    const m = /^\s*- (.*)$/.exec(line);
    if (!m) break;
    const v = m[1];
    dict.push(v.length >= 2 && v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replaceAll("''", "'") : v);
  }
  return dict;
}

const ppocr = join(root, 'public', 'ppocr');
rmSync(ppocr, { recursive: true, force: true });
mkdirSync(ppocr, { recursive: true });
writeFileSync(join(ppocr, manifest.det.name), await pinned(manifest.det));
writeFileSync(join(ppocr, manifest.rec.name), await pinned(manifest.rec));
const dict = dictFromYml((await pinned(manifest.dict)).toString('utf8'));
if (dict.length !== 6904) throw new Error(`dictionary has ${dict.length} entries, expected 6904`);
writeFileSync(join(ppocr, manifest.dict.name), JSON.stringify(dict));
console.log('Copied PP-OCRv6 tiny to public/ppocr');
