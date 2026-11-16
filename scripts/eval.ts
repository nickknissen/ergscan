import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { firstParsed } from '../src/ocr/firstParsed';
import { OCR_ENGINE, OCR_PARAMS } from '../src/ocr/ocrConfig';
import { DEFAULT_PREPROCESS, ocrInputs, type PreprocessOptions } from '../src/ocr/preprocess';
import { toGrayscale } from '../src/ocr/threshold';
import { loadFacts, TESTDATA_DIR } from '../testdata/facts';
import { scoreOcr, scoreWorkout, type OcrScore, type WorkoutScore } from '../testdata/score';

const root = join(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    long: { type: 'string' },
    blur: { type: 'string' },
    sens: { type: 'string' },
    label: { type: 'string' },
    show: { type: 'boolean', default: false },
  },
});

const options: PreprocessOptions = {
  longSide: Number(args.long ?? DEFAULT_PREPROCESS.longSide),
  blurRadius: Number(args.blur ?? DEFAULT_PREPROCESS.blurRadius),
  sensitivity: Number(args.sens ?? DEFAULT_PREPROCESS.sensitivity),
};

async function loadGray(file: string, longSide: number) {
  const { data, info } = await sharp(file)
    .rotate()
    .resize({ width: longSide, height: longSide, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { gray: toGrayscale(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)), width: info.width, height: info.height };
}

const toPng = (values: Uint8Array, width: number, height: number) =>
  sharp(Buffer.from(values), { raw: { width, height, channels: 1 } }).png().toBuffer();

const worker = await createWorker('eng', OCR_ENGINE, {
  langPath: join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
  cachePath: join(root, 'node_modules/.cache/ergscan-eval'),
  gzip: true,
});
await worker.setParameters(OCR_PARAMS);

interface Result extends OcrScore, WorkoutScore {
  name: string;
  ms: number;
}

const results: Result[] = [];
for (const { name, facts } of loadFacts()) {
  if (args.only && !name.includes(args.only)) continue;
  const started = Date.now();
  const { gray, width, height } = await loadGray(join(TESTDATA_DIR, facts.image), options.longSide);
  const images = ocrInputs(gray, width, height, options);
  const outcome = await firstParsed(
    images.map((img) => async () => (await worker.recognize(await toPng(img, width, height))).data.text),
  );
  const result = { name, ms: Date.now() - started, ...scoreOcr(outcome.text, facts.screen.rows), ...scoreWorkout(outcome.scan, facts) };
  results.push(result);
  if (args.show) console.log(`--- ${name}\n${outcome.text}`);
}
await worker.terminate();

const pct = (a: number, b: number) => (b === 0 ? '-' : `${Math.round((100 * a) / b)}%`);
const sum = (key: keyof Result) => results.reduce((a, r) => a + (r[key] as number), 0);

console.log(`\noptions ${JSON.stringify(options)}\n`);
console.log(['image'.padEnd(52), 'ocr cells', 'ocr rows', 'fields', 'laps', 'ms'].join('  '));
for (const r of results) {
  console.log(
    [
      r.name.slice(0, 52).padEnd(52),
      `${r.cells}/${r.cellsTotal}`.padStart(9),
      `${r.rows}/${r.rowsTotal}`.padStart(8),
      `${r.fields}/${r.fieldsTotal}`.padStart(6),
      `${r.laps}/${r.lapsExpected}`.padStart(4),
      String(r.ms).padStart(5),
    ].join('  '),
  );
}
const totals = {
  ocrCells: pct(sum('cells'), sum('cellsTotal')),
  ocrRows: pct(sum('rows'), sum('rowsTotal')),
  fields: pct(sum('fields'), sum('fieldsTotal')),
  exactLapCounts: `${results.filter((r) => r.laps === r.lapsExpected).length}/${results.length}`,
};
console.log(`\nTOTAL  ocr cells ${totals.ocrCells}  ocr rows ${totals.ocrRows}  workout fields ${totals.fields}  lap counts ${totals.exactLapCounts}`);

const outDir = join(root, 'eval-results');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(outDir, `${stamp}${args.label ? `-${args.label}` : ''}.json`);
writeFileSync(file, JSON.stringify({ options, totals, results }, null, 2));
console.log(`saved ${file}`);
