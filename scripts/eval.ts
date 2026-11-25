import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { cropGray } from '../src/ocr/crop';
import { parsePm5Text, type ParsedScan } from '../src/core/pm5Parser';
import { mergeScans } from '../src/core/scanMerge';
import type { ScanOutcome } from '../src/ocr/firstParsed';
import { SCREEN_GUIDE } from '../src/ocr/guide';
import { OCR_ENGINE, OCR_PARAMS, wordBoxes } from '../src/ocr/ocrConfig';
import {
  OFFICIAL_DET,
  ortSessions,
  PPOCR_FRAMED_WIDTH,
  PPOCR_LONG_SIDE,
  PPOCR_SETTINGS,
  readRgba,
  type PpocrSettings,
  type RgbaImage,
} from '../src/ocr/ppocr-prototype/pipeline';
import { DEFAULT_PREPROCESS, type PreprocessOptions } from '../src/ocr/preprocess';
import { readPhoto } from '../src/ocr/readPhoto';
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
    // PROTOTYPE (branch prototype/pp-ocrv6): `--engine ppocr` and its settings.
    engine: { type: 'string', default: 'tesseract' },
    'ppocr-long': { type: 'string' },
    'ppocr-width': { type: 'string' },
    'det-side': { type: 'string' },
    'det-official': { type: 'boolean', default: false },
    'rec-width': { type: 'string' },
    'rec-batch': { type: 'string' },
    gray: { type: 'boolean', default: false },
  },
});

const options: PreprocessOptions = {
  longSide: Number(args.long ?? DEFAULT_PREPROCESS.longSide),
  blurRadius: Number(args.blur ?? DEFAULT_PREPROCESS.blurRadius),
  sensitivity: Number(args.sens ?? DEFAULT_PREPROCESS.sensitivity),
  cropWidth: args.crop === undefined ? DEFAULT_PREPROCESS.cropWidth : Number(args.crop) || null,
  detectScreen: !args.framed,
};

type ScreenRect = { x: number; y: number; width: number; height: number };

function frameRect(width: number, height: number, screen: ScreenRect) {
  const m = SCREEN_GUIDE.margin;
  const x0 = Math.max(0, Math.round((screen.x - screen.width * m) * width));
  const y0 = Math.max(0, Math.round((screen.y - screen.height * m) * height));
  const x1 = Math.min(width, Math.round((screen.x + screen.width * (1 + m)) * width));
  const y1 = Math.min(height, Math.round((screen.y + screen.height * (1 + m)) * height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function frameAroundScreen(gray: Uint8Array, width: number, height: number, screen: ScreenRect) {
  const rect = frameRect(width, height, screen);
  return { gray: cropGray(gray, width, rect), width: rect.width, height: rect.height };
}

// PROTOTYPE (branch prototype/pp-ocrv6): PP-OCRv6 tiny in onnxruntime-web's WebAssembly, one thread, as a
// browser runs it. The models come from public/ppocr (`npm run ocr-assets`).
async function loadPpocr() {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const dir = join(root, 'public', 'ppocr');
  const models = JSON.parse(readFileSync(join(root, 'src/ocr/ppocr-prototype/models.json'), 'utf8')) as Record<'det' | 'rec' | 'dict', { name: string }>;
  const started = Date.now();
  const sessions = await ortSessions(ort, readFileSync(join(dir, models.det.name)), readFileSync(join(dir, models.rec.name)));
  const num = (key: 'det-side' | 'rec-width' | 'rec-batch') => (args[key] === undefined ? {} : { [key === 'det-side' ? 'detSide' : key === 'rec-width' ? 'recMinWidth' : 'recBatch']: Number(args[key]) });
  const settings: PpocrSettings = {
    ...PPOCR_SETTINGS,
    ...(args['det-official'] ? OFFICIAL_DET : {}),
    ...num('det-side'),
    ...num('rec-width'),
    ...num('rec-batch'),
    gray: args.gray,
  };
  return { sessions, settings, dict: JSON.parse(readFileSync(join(dir, models.dict.name), 'utf8')) as string[], loadMs: Date.now() - started };
}

/** The whole photo at 1000 px on its long side, or with `--framed` the labelled screen cropped and scaled to 800 px wide. */
async function loadRgba(file: string, screen: ScreenRect | null): Promise<RgbaImage> {
  const fit = (side: number) => ({ width: side, height: side, fit: 'inside' as const, withoutEnlargement: true });
  if (!screen) {
    const { data, info } = await sharp(file).rotate().resize(fit(Number(args['ppocr-long'] ?? PPOCR_LONG_SIDE))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }
  const big = await sharp(file).rotate().resize(fit(2000)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rect = frameRect(big.info.width, big.info.height, screen);
  const { data, info } = await sharp(big.data, { raw: { width: big.info.width, height: big.info.height, channels: 4 } })
    .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
    .resize({ width: Number(args['ppocr-width'] ?? PPOCR_FRAMED_WIDTH) })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const ppocr = args.engine === 'ppocr' ? await loadPpocr() : null;
if (ppocr) console.log(`ppocr settings ${JSON.stringify(ppocr.settings)}; runtime and models loaded in ${ppocr.loadMs} ms`);

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
  ppocr?: { detMs: number; recMs: number; boxes: number };
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
  if (ppocr) {
    const image = await loadRgba(join(TESTDATA_DIR, facts.image), args.framed ? facts.screenRect : null);
    const read = await readRgba(image, ppocr.sessions, ppocr.dict, ppocr.settings);
    const outcome = { scan: parsePm5Text(read.text), text: read.text };
    outcomes.set(name, outcome);
    if (!listed) continue;
    const ms = Date.now() - started;
    results.push({ name, ms, ppocr: { detMs: read.detMs, recMs: read.recMs, boxes: read.boxes }, ...scoreOcr(read.text, facts.screen.rows), ...scoreWorkout(outcome.scan, facts.workout) });
    console.log(`${name}: ${ms} ms (detect ${Math.round(read.detMs)}, recognise ${Math.round(read.recMs)}), ${read.boxes} boxes`);
    if (args.show) console.log(`--- ${name}\n${read.text}`);
    continue;
  }
  const loaded = await loadGray(join(TESTDATA_DIR, facts.image), options.longSide);
  const { gray, width, height } = args.framed ? frameAroundScreen(loaded.gray, loaded.width, loaded.height, facts.screenRect) : loaded;
  let dumped = 0;
  const outcome = await readPhoto(
    gray,
    width,
    height,
    {
      text: async (img) => {
        const png = await toPng(img.values, img.width, img.height);
        if (args.dump) writeFileSync(join(dumpDir, `${name}-${dumped++}.png`), png);
        return (await worker.recognize(png)).data.text;
      },
      words: async (img) => {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const { data } = await worker.recognize(await toPng(img.values, img.width, img.height), {}, { blocks: true, text: false });
        await worker.setParameters(OCR_PARAMS);
        return wordBoxes(data.blocks);
      },
    },
    options,
  );
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
  wholeWorkouts: `${results.filter((r) => r.fields === r.fieldsTotal).length}/${results.length}`,
  multiFields: pct(multiSum('fields'), multiSum('fieldsTotal')),
  multiExactLapCounts: `${multiResults.filter((r) => r.laps === r.lapsExpected).length}/${multiResults.length}`,
};
console.log(`\nTOTAL  ocr cells ${totals.ocrCells}  ocr rows ${totals.ocrRows}  workout fields ${totals.fields}  lap counts ${totals.exactLapCounts}  whole workouts ${totals.wholeWorkouts}`);
if (ppocr) {
  const med = (v: number[]) => Math.round(v.sort((a, b) => a - b)[v.length >> 1] ?? 0);
  const runs = results.flatMap((r) => (r.ppocr ? [r.ppocr] : []));
  console.log(`PPOCR  median detect ${med(runs.map((r) => r.detMs))} ms  recognise ${med(runs.map((r) => r.recMs))} ms  boxes ${med(runs.map((r) => r.boxes))}`);
}
console.log(`MULTI  workout fields ${totals.multiFields}  lap counts ${totals.multiExactLapCounts}`);

const outDir = join(root, 'eval-results');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(outDir, `${stamp}${args.label ? `-${args.label}` : ''}.json`);
writeFileSync(file, JSON.stringify({ options, ppocr: ppocr && { settings: ppocr.settings, framed: args.framed }, totals, results, multiResults }, null, 2));
console.log(`saved ${file}`);
