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
import { ortSessions, PPOCR_FRAMED_SETTINGS, PPOCR_FRAMED_WIDTH, PPOCR_LONG_SIDE, PPOCR_SETTINGS, readRgba, type RgbaImage } from '../src/ocr/ppocr/pipeline';
import { DEFAULT_PREPROCESS, type PreprocessOptions } from '../src/ocr/preprocess';
import { readPhoto } from '../src/ocr/readPhoto';
import { toGrayscale } from '../src/ocr/threshold';
import { loadFacts, loadMultiFacts, TESTDATA_DIR } from '../testdata/facts';
import { scoreOcr, scoreWorkout, type OcrScore, type WorkoutScore } from '../testdata/score';

const root = join(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    engine: { type: 'string', default: 'ppocr' },
    only: { type: 'string' },
    long: { type: 'string' },
    blur: { type: 'string' },
    sens: { type: 'string' },
    crop: { type: 'string' },
    'rec-width': { type: 'string' },
    label: { type: 'string' },
    dump: { type: 'boolean', default: false },
    framed: { type: 'boolean', default: false },
    show: { type: 'boolean', default: false },
  },
});
if (args.engine !== 'ppocr' && args.engine !== 'tesseract') throw new Error(`--engine is ppocr or tesseract, not ${args.engine}`);

type ScreenRect = { x: number; y: number; width: number; height: number };

/** The labelled screen with the camera frame's margin around it, in a `width × height` image. */
function frameRect(width: number, height: number, screen: ScreenRect) {
  const m = SCREEN_GUIDE.margin;
  const x0 = Math.max(0, Math.round((screen.x - screen.width * m) * width));
  const y0 = Math.max(0, Math.round((screen.y - screen.height * m) * height));
  const x1 = Math.min(width, Math.round((screen.x + screen.width * (1 + m)) * width));
  const y1 = Math.min(height, Math.round((screen.y + screen.height * (1 + m)) * height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Reads one test photo as the app would; `screen` is set with `--framed`, as if taken in the camera frame. */
type Reader = { read(name: string, file: string, screen: ScreenRect | null): Promise<ScanOutcome>; close(): Promise<void> };

const options: PreprocessOptions = {
  longSide: Number(args.long ?? DEFAULT_PREPROCESS.longSide),
  blurRadius: Number(args.blur ?? DEFAULT_PREPROCESS.blurRadius),
  sensitivity: Number(args.sens ?? DEFAULT_PREPROCESS.sensitivity),
  cropWidth: args.crop === undefined ? DEFAULT_PREPROCESS.cropWidth : Number(args.crop) || null,
  detectScreen: !args.framed,
};
const settings = { ...(args.framed ? PPOCR_FRAMED_SETTINGS : PPOCR_SETTINGS), ...(args['rec-width'] === undefined ? {} : { recMinWidth: Number(args['rec-width']) }) };

/** Tesseract with the app's preprocessing, screen detection and heading-row retry. */
async function tesseractReader(): Promise<Reader> {
  const worker = await createWorker('eng', OCR_ENGINE, {
    langPath: join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
    cachePath: join(root, 'node_modules/.cache/ergscan-eval'),
    gzip: true,
  });
  await worker.setParameters(OCR_PARAMS);
  const dumpDir = join(root, 'eval-results', 'images');
  if (args.dump) mkdirSync(dumpDir, { recursive: true });
  const toPng = (values: Uint8Array, width: number, height: number) => sharp(Buffer.from(values), { raw: { width, height, channels: 1 } }).png().toBuffer();

  async function loadGray(file: string, screen: ScreenRect | null) {
    const { data, info } = await sharp(file)
      .rotate()
      .resize({ width: options.longSide, height: options.longSide, fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gray = toGrayscale(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length));
    if (!screen) return { gray, width: info.width, height: info.height };
    const rect = frameRect(info.width, info.height, screen);
    return { gray: cropGray(gray, info.width, rect), width: rect.width, height: rect.height };
  }

  return {
    async read(name, file, screen) {
      const { gray, width, height } = await loadGray(file, screen);
      let dumped = 0;
      return readPhoto(
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
    },
    close: async () => void (await worker.terminate()),
  };
}

/** PP-OCRv6 tiny on onnxruntime-web's WebAssembly with one thread, as a browser runs it; models from `public/ppocr`. */
async function ppocrReader(): Promise<Reader> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const dir = join(root, 'public', 'ppocr');
  const models = JSON.parse(readFileSync(join(root, 'src/ocr/ppocr/models.json'), 'utf8')) as Record<'det' | 'rec' | 'dict', { name: string }>;
  const sessions = await ortSessions(ort, readFileSync(join(dir, models.det.name)), readFileSync(join(dir, models.rec.name)));
  const dict = JSON.parse(readFileSync(join(dir, models.dict.name), 'utf8')) as string[];

  /** The whole photo at 1000 px on its long side, or the framed screen scaled to 800 px wide. */
  async function loadRgba(file: string, screen: ScreenRect | null): Promise<RgbaImage> {
    const fit = (side: number) => ({ width: side, height: side, fit: 'inside' as const, withoutEnlargement: true });
    if (!screen) {
      const { data, info } = await sharp(file).rotate().resize(fit(PPOCR_LONG_SIDE)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height };
    }
    const big = await sharp(file).rotate().resize(fit(2000)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rect = frameRect(big.info.width, big.info.height, screen);
    const { data, info } = await sharp(big.data, { raw: { width: big.info.width, height: big.info.height, channels: 4 } })
      .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
      .resize({ width: PPOCR_FRAMED_WIDTH })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  return {
    async read(_name, file, screen) {
      const { text } = await readRgba(await loadRgba(file, screen), sessions, dict, settings);
      return { scan: parsePm5Text(text), text };
    },
    close: async () => {},
  };
}

interface Result extends OcrScore, WorkoutScore {
  name: string;
  ms: number;
  text: string;
}

const reader = args.engine === 'tesseract' ? await tesseractReader() : await ppocrReader();
const allFacts = loadFacts();
const multiFacts = loadMultiFacts().filter(({ name, facts }) => !args.only || name.includes(args.only) || facts.pages.some((p) => p.includes(args.only!)));
const multiPages = new Set(multiFacts.flatMap(({ facts }) => facts.pages));
const outcomes = new Map<string, ScanOutcome>();

const results: Result[] = [];
for (const { name, facts } of allFacts) {
  const listed = !args.only || name.includes(args.only);
  if (!listed && !multiPages.has(name)) continue;
  const started = Date.now();
  const outcome = await reader.read(name, join(TESTDATA_DIR, facts.image), args.framed ? facts.screenRect : null);
  outcomes.set(name, outcome);
  if (!listed) continue;
  results.push({ name, ms: Date.now() - started, text: outcome.text, ...scoreOcr(outcome.text, facts.screen.rows), ...scoreWorkout(outcome.scan, facts.workout) });
  if (args.show) console.log(`--- ${name}\n${outcome.text}`);
}
await reader.close();

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
const setup = args.engine === 'tesseract' ? { engine: args.engine, options } : { engine: args.engine, framed: args.framed, settings };

console.log(`\n${JSON.stringify(setup)}\n`);
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
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const totals = {
  ocrCells: pct(sum('cells'), sum('cellsTotal')),
  ocrRows: pct(sum('rows'), sum('rowsTotal')),
  ocrDigitRows: pct(sum('digitRows'), sum('rowsTotal')),
  fields: pct(sum('fields'), sum('fieldsTotal')),
  wholeWorkouts: `${results.filter((r) => r.fields === r.fieldsTotal).length}/${results.length}`,
  exactLapCounts: `${results.filter((r) => r.laps === r.lapsExpected).length}/${results.length}`,
  medianMs: ms[ms.length >> 1] ?? 0,
  multiFields: pct(multiSum('fields'), multiSum('fieldsTotal')),
  multiExactLapCounts: `${multiResults.filter((r) => r.laps === r.lapsExpected).length}/${multiResults.length}`,
};
console.log(
  `\nTOTAL  ocr cells ${totals.ocrCells}  ocr rows ${totals.ocrRows} (digits right ${totals.ocrDigitRows})  workout fields ${totals.fields}` +
    `  whole workouts ${totals.wholeWorkouts}  lap counts ${totals.exactLapCounts}  median ${totals.medianMs} ms`,
);
console.log(`MULTI  workout fields ${totals.multiFields}  lap counts ${totals.multiExactLapCounts}`);

const outDir = join(root, 'eval-results');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(outDir, `${stamp}${args.label ? `-${args.label}` : ''}.json`);
writeFileSync(file, JSON.stringify({ setup, totals, results, multiResults }, null, 2));
console.log(`saved ${file}`);
