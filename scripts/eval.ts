import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { cropGray } from '../src/ocr/crop';
import type { ParsedScan } from '../src/core/pm5Parser';
import { mergeScans } from '../src/core/scanMerge';
import { firstParsed, type ScanOutcome } from '../src/ocr/firstParsed';
import { SCREEN_GUIDE } from '../src/ocr/guide';
import { OCR_ENGINE, OCR_PARAMS } from '../src/ocr/ocrConfig';
import { DEFAULT_PREPROCESS, ocrInputs, type PreprocessOptions } from '../src/ocr/preprocess';
import { toGrayscale } from '../src/ocr/threshold';
import { loadFacts, loadMultiFacts, TESTDATA_DIR } from '../testdata/facts';
import { scoreOcr, scoreWorkout, type OcrScore, type WorkoutScore } from '../testdata/score';

const root = join(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    long: { type: 'string' },
    blur: { type: 'string' },
    sens: { type: 'string' },
    crop: { type: 'string' },
    label: { type: 'string' },
    dump: { type: 'boolean', default: false },
    framed: { type: 'boolean', default: false },
    show: { type: 'boolean', default: false },
  },
});

const options: PreprocessOptions = {
  longSide: Number(args.long ?? DEFAULT_PREPROCESS.longSide),
  blurRadius: Number(args.blur ?? DEFAULT_PREPROCESS.blurRadius),
  sensitivity: Number(args.sens ?? DEFAULT_PREPROCESS.sensitivity),
  cropWidth: args.crop === undefined ? DEFAULT_PREPROCESS.cropWidth : Number(args.crop) || null,
  detectScreen: !args.framed,
};

function frameAroundScreen(gray: Uint8Array, width: number, height: number, screen: { x: number; y: number; width: number; height: number }) {
  const m = SCREEN_GUIDE.margin;
  const x0 = Math.max(0, Math.round((screen.x - screen.width * m) * width));
  const y0 = Math.max(0, Math.round((screen.y - screen.height * m) * height));
  const x1 = Math.min(width, Math.round((screen.x + screen.width * (1 + m)) * width));
  const y1 = Math.min(height, Math.round((screen.y + screen.height * (1 + m)) * height));
  const rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  return { gray: cropGray(gray, width, rect), width: rect.width, height: rect.height };
}

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

const dumpDir = join(root, 'eval-results', 'images');
if (args.dump) mkdirSync(dumpDir, { recursive: true });

const allFacts = loadFacts();
const multiFacts = loadMultiFacts().filter(({ name, facts }) => !args.only || name.includes(args.only) || facts.pages.some((p) => p.includes(args.only!)));
const multiPages = new Set(multiFacts.flatMap(({ facts }) => facts.pages));
const outcomes = new Map<string, ScanOutcome>();

const results: Result[] = [];
for (const { name, facts } of allFacts) {
  const listed = !args.only || name.includes(args.only);
  if (!listed && !multiPages.has(name)) continue;
  const started = Date.now();
  const loaded = await loadGray(join(TESTDATA_DIR, facts.image), options.longSide);
  const { gray, width, height } = args.framed ? frameAroundScreen(loaded.gray, loaded.width, loaded.height, facts.screenRect) : loaded;
  const inputs = ocrInputs(gray, width, height, options);
  const pngs = await Promise.all(inputs.images.map((img) => toPng(img, inputs.width, inputs.height)));
  if (args.dump) pngs.forEach((png, i) => writeFileSync(join(dumpDir, `${name}-${i}.png`), png));
  const outcome = await firstParsed(pngs.map((png) => async () => (await worker.recognize(png)).data.text));
  outcomes.set(name, outcome);
  if (!listed) continue;
  const result = { name, ms: Date.now() - started, ...scoreOcr(outcome.text, facts.screen.rows), ...scoreWorkout(outcome.scan, facts.workout) };
  results.push(result);
  if (args.show) console.log(`--- ${name}\n${outcome.text}`);
}
await worker.terminate();

interface MultiResult extends WorkoutScore {
  name: string;
  photos: number;
}

const multiResults: MultiResult[] = multiFacts.map(({ name, facts }) => {
  const scans = facts.pages.map((page) => outcomes.get(page)?.scan ?? null);
  const merged = scans.reduce<ParsedScan | null>((acc, scan) => (acc && scan ? mergeScans(acc, scan) : (acc ?? scan)), null);
  return { name, photos: facts.pages.length, ...scoreWorkout(merged, facts.workout) };
});

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
if (multiResults.length) {
  console.log(`\n${['multi-photo workout'.padEnd(52), 'photos', 'fields', 'laps'].join('  ')}`);
  for (const r of multiResults) {
    console.log([r.name.slice(0, 52).padEnd(52), String(r.photos).padStart(6), `${r.fields}/${r.fieldsTotal}`.padStart(6), `${r.laps}/${r.lapsExpected}`.padStart(4)].join('  '));
  }
}
const multiSum = (key: keyof WorkoutScore) => multiResults.reduce((a, r) => a + r[key], 0);
const totals = {
  ocrCells: pct(sum('cells'), sum('cellsTotal')),
  ocrRows: pct(sum('rows'), sum('rowsTotal')),
  fields: pct(sum('fields'), sum('fieldsTotal')),
  exactLapCounts: `${results.filter((r) => r.laps === r.lapsExpected).length}/${results.length}`,
  multiFields: pct(multiSum('fields'), multiSum('fieldsTotal')),
  multiExactLapCounts: `${multiResults.filter((r) => r.laps === r.lapsExpected).length}/${multiResults.length}`,
};
console.log(`\nTOTAL  ocr cells ${totals.ocrCells}  ocr rows ${totals.ocrRows}  workout fields ${totals.fields}  lap counts ${totals.exactLapCounts}`);
console.log(`MULTI  workout fields ${totals.multiFields}  lap counts ${totals.multiExactLapCounts}`);

const outDir = join(root, 'eval-results');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(outDir, `${stamp}${args.label ? `-${args.label}` : ''}.json`);
writeFileSync(file, JSON.stringify({ options, totals, results, multiResults }, null, 2));
console.log(`saved ${file}`);
