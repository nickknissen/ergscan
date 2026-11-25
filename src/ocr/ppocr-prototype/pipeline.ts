/**
 * PROTOTYPE (branch prototype/pp-ocrv6, throwaway): PP-OCRv6 tiny, detector then recogniser, as RapidOCR 3.10.0
 * ran it for the measurements in docs/research/ocr-accuracy.md (2.6, R2). Pure: the ONNX sessions come in as
 * `PpocrSessions`, so the same code runs in the browser worker and in `npm run eval -- --engine ppocr`.
 */
import type * as Ort from 'onnxruntime-web';
import {
  applyPerspective,
  boxScore,
  componentHulls,
  minAreaRect,
  miniBox,
  orderClockwise,
  perspective,
  roundHalfEven,
  unclip,
  type Point,
  type Quad,
} from './geometry';

export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Output {
  data: Float32Array;
  dims: readonly number[];
}

export interface PpocrSessions {
  det(input: Float32Array, dims: number[]): Promise<Output>;
  rec(input: Float32Array, dims: number[]): Promise<Output>;
}

export interface PpocrSettings {
  /** The detector input's short side is scaled up to at least this, then both sides rounded to multiples of 32. */
  detSide: number;
  /** `half`: (x/255 − 0.5)/0.5, as RapidOCR. `imagenet`: the mean and spread in the model's own inference.yml. */
  detNorm: 'half' | 'imagenet';
  thresh: number;
  boxThresh: number;
  unclipRatio: number;
  /** Boxes are padded to at least this width for the recogniser (RapidOCR: 320). 0 reads each at its own width. */
  recMinWidth: number;
  recBatch: number;
  minScore: number;
  gray: boolean;
}

/** What the measured 94% of fields used. */
export const RAPIDOCR_SETTINGS: PpocrSettings = {
  detSide: 736,
  detNorm: 'half',
  thresh: 0.3,
  boxThresh: 0.5,
  unclipRatio: 1.6,
  recMinWidth: 320,
  recBatch: 6,
  minScore: 0.3,
  gray: false,
};

/**
 * What the app uses: RapidOCR's settings, but each batch of boxes padded only to its widest box, not to 320 px.
 * On the 75 photos that halved recognition time and raised fields from 94% to 95%.
 */
export const PPOCR_SETTINGS: PpocrSettings = { ...RAPIDOCR_SETTINGS, recMinWidth: 0 };

/** The official inference.yml's post-processing. */
export const OFFICIAL_DET: Partial<PpocrSettings> = { detNorm: 'imagenet', thresh: 0.2, boxThresh: 0.4, unclipRatio: 1.4 };

/** Long side of a whole photo before reading, and width of a photo already framed on the screen (R3). */
export const PPOCR_LONG_SIDE = 1000;
export const PPOCR_FRAMED_WIDTH = 800;

export interface PpocrWord {
  quad: Quad;
  text: string;
  score: number;
}

export interface PpocrRead {
  text: string;
  words: PpocrWord[];
  boxes: number;
  detMs: number;
  recMs: number;
  detSize: [number, number];
}

const REC_HEIGHT = 48;
const now = () => performance.now();

/** Reads a colour photo: text lines joined as `parsePm5Text` expects, and the words with their boxes. */
export async function readRgba(
  image: RgbaImage,
  sessions: PpocrSessions,
  dict: string[],
  settings: PpocrSettings = PPOCR_SETTINGS,
  onProgress?: (done: number, total: number) => void,
): Promise<PpocrRead> {
  const source = settings.gray ? toGray(image) : image;
  const t0 = now();
  const { tensor, width: dw, height: dh } = detInput(source, settings);
  const prob = await sessions.det(tensor, [1, 3, dh, dw]);
  const quads = detBoxes(prob.data, dw, dh, source.width, source.height, settings);
  const t1 = now();
  const words = (await recognize(source, quads, sessions, dict, settings, onProgress)).filter((w) => w.score >= settings.minScore);
  const t2 = now();
  return { text: toLines(sortBoxes(words)), words, boxes: quads.length, detMs: t1 - t0, recMs: t2 - t1, detSize: [dw, dh] };
}

export function toGray(image: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const v = 0.299 * image.data[i]! + 0.587 * image.data[i + 1]! + 0.114 * image.data[i + 2]!;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { data, width: image.width, height: image.height };
}

/** Bilinear sample with edge pixels repeated, written as the model's BGR planes. */
function sampleInto(img: RgbaImage, x: number, y: number, out: Float32Array, at: number, plane: number, norm: (v: number, c: number) => number) {
  const { data, width, height } = img;
  x = Math.min(Math.max(x, 0), width - 1);
  y = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i01 = (y0 * width + x1) * 4;
  const i10 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  for (let c = 0; c < 3; c++) {
    const rgb = 2 - c; // channel 0 is blue
    const top = data[i00 + rgb]! + (data[i01 + rgb]! - data[i00 + rgb]!) * fx;
    const bottom = data[i10 + rgb]! + (data[i11 + rgb]! - data[i10 + rgb]!) * fx;
    out[at + c * plane] = norm(top + (bottom - top) * fy, c);
  }
}

const HALF = (v: number) => (v / 255 - 0.5) / 0.5;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const IMAGENET = (v: number, c: number) => (v / 255 - MEAN[c]!) / STD[c]!;

export function detInput(image: RgbaImage, settings: PpocrSettings): { tensor: Float32Array; width: number; height: number } {
  const { width: w, height: h } = image;
  const ratio = Math.min(w, h) < settings.detSide ? settings.detSide / Math.min(w, h) : 1;
  const width = roundHalfEven(Math.trunc(w * ratio) / 32) * 32;
  const height = roundHalfEven(Math.trunc(h * ratio) / 32) * 32;
  const tensor = new Float32Array(3 * width * height);
  const norm = settings.detNorm === 'imagenet' ? IMAGENET : HALF;
  const sx = w / width;
  const sy = h / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sampleInto(image, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, tensor, y * width + x, width * height, norm);
    }
  }
  return { tensor, width, height };
}

/** DB post-processing: probability map to boxes in the source image, ordered clockwise from top-left. */
export function detBoxes(prob: Float32Array, width: number, height: number, srcWidth: number, srcHeight: number, settings: PpocrSettings): Quad[] {
  // Threshold, then dilate with a 2×2 kernel (OpenCV's anchor: a pixel is set when it or its left, upper or
  // upper-left neighbour is).
  const above = new Uint8Array(width * height);
  for (let i = 0; i < above.length; i++) above[i] = prob[i]! > settings.thresh ? 1 : 0;
  const bitmap = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      bitmap[i] = above[i]! | (x > 0 ? above[i - 1]! : 0) | (y > 0 ? above[i - width]! : 0) | (x > 0 && y > 0 ? above[i - width - 1]! : 0);
    }
  }
  const boxes: Quad[] = [];
  for (const hull of componentHulls(bitmap, width, height).slice(0, 1000)) {
    const rect = minAreaRect(hull);
    if (rect.short < 3) continue;
    const box = miniBox(rect.corners);
    if (boxScore(prob, width, height, box) < settings.boxThresh) continue;
    const grown = unclip(box, settings.unclipRatio);
    if (grown.short < 5) continue;
    const scaled = grown.box.map(([x, y]) => [
      Math.min(Math.max(roundHalfEven((x / width) * srcWidth), 0), srcWidth),
      Math.min(Math.max(roundHalfEven((y / height) * srcHeight), 0), srcHeight),
    ]) as Point[];
    const quad = orderClockwise(scaled).map(([x, y]) => [Math.min(Math.max(x, 0), srcWidth - 1), Math.min(Math.max(y, 0), srcHeight - 1)]) as Quad;
    const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (Math.trunc(dist(quad[0], quad[1])) <= 3 || Math.trunc(dist(quad[0], quad[3])) <= 3) continue;
    boxes.push(quad);
  }
  return boxes;
}

interface Crop {
  quad: Quad;
  /** Crop-to-source homography; the crop is `width × height` before any turn. */
  toSource: number[];
  width: number;
  height: number;
  /** Taller than wide by 1.5 or more: turned a quarter anticlockwise, as RapidOCR does. */
  turned: boolean;
  ratio: number;
}

function cropOf(quad: Quad): Crop {
  const d = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const width = Math.trunc(Math.max(d(quad[0], quad[1]), d(quad[2], quad[3])));
  const height = Math.trunc(Math.max(d(quad[0], quad[3]), d(quad[1], quad[2])));
  const rect: Point[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const turned = height / width >= 1.5;
  return { quad, toSource: perspective(rect, quad), width, height, turned, ratio: turned ? height / width : width / height };
}

/** The crop warped upright and resized to 48 px high in one bilinear pass, at `offset` in a padded batch. */
function writeCrop(image: RgbaImage, crop: Crop, out: Float32Array, offset: number, batchWidth: number) {
  const resized = Math.min(batchWidth, Math.ceil(REC_HEIGHT * crop.ratio));
  const [rw, rh] = crop.turned ? [crop.height, crop.width] : [crop.width, crop.height];
  const plane = REC_HEIGHT * batchWidth;
  for (let v = 0; v < REC_HEIGHT; v++) {
    const ry = Math.min(Math.max((v + 0.5) * (rh / REC_HEIGHT) - 0.5, 0), rh - 1);
    for (let u = 0; u < resized; u++) {
      const rx = Math.min(Math.max((u + 0.5) * (rw / resized) - 0.5, 0), rw - 1);
      const [cx, cy] = crop.turned ? [crop.width - 1 - ry, rx] : [rx, ry];
      const [sx, sy] = applyPerspective(crop.toSource, cx, cy);
      sampleInto(image, sx, sy, out, offset + v * batchWidth + u, plane, HALF);
    }
  }
}

async function recognize(
  image: RgbaImage,
  quads: Quad[],
  sessions: PpocrSessions,
  dict: string[],
  settings: PpocrSettings,
  onProgress?: (done: number, total: number) => void,
): Promise<PpocrWord[]> {
  const crops = quads.map(cropOf);
  const order = crops.map((_, i) => i).sort((a, b) => crops[a]!.ratio - crops[b]!.ratio);
  const words: PpocrWord[] = new Array<PpocrWord>(crops.length);
  for (let start = 0; start < order.length; start += settings.recBatch) {
    const batch = order.slice(start, start + settings.recBatch);
    const maxRatio = Math.max(settings.recMinWidth / REC_HEIGHT, ...batch.map((i) => crops[i]!.ratio));
    const batchWidth = Math.max(16, Math.trunc(REC_HEIGHT * maxRatio));
    const size = 3 * REC_HEIGHT * batchWidth;
    const tensor = new Float32Array(batch.length * size);
    batch.forEach((i, k) => writeCrop(image, crops[i]!, tensor, k * size, batchWidth));
    const out = await sessions.rec(tensor, [batch.length, 3, REC_HEIGHT, batchWidth]);
    ctcDecode(out, dict).forEach((r, k) => (words[batch[k]!] = { quad: crops[batch[k]!]!.quad, ...r }));
    onProgress?.(Math.min(start + settings.recBatch, order.length), order.length);
  }
  return words;
}

/** Best class per step, repeats collapsed, blanks dropped. Class 0 is the blank, the last a space. */
export function ctcDecode(out: Output, dict: string[]): { text: string; score: number }[] {
  const [n, steps, classes] = out.dims as [number, number, number];
  if (classes !== dict.length + 2) throw new Error(`recogniser has ${classes} classes, dictionary ${dict.length}`);
  const results: { text: string; score: number }[] = [];
  for (let b = 0; b < n; b++) {
    let text = '';
    let sum = 0;
    let kept = 0;
    let last = -1;
    for (let t = 0; t < steps; t++) {
      const base = (b * steps + t) * classes;
      let best = 0;
      let bestP = out.data[base]!;
      for (let c = 1; c < classes; c++) {
        const p = out.data[base + c]!;
        if (p > bestP) {
          bestP = p;
          best = c;
        }
      }
      if (best !== 0 && best !== last) {
        text += best === classes - 1 ? ' ' : dict[best - 1];
        sum += bestP;
        kept++;
      }
      last = best;
    }
    results.push({ text, score: kept ? sum / kept : 0 });
  }
  return results;
}

/** RapidOCR's `sorted_boxes`: by top-left y, lines broken at a 10 px step, then by x within a line. */
export function sortBoxes<T extends { quad: Quad }>(words: T[]): T[] {
  const byY = words.slice().sort((a, b) => a.quad[0][1] - b.quad[0][1]);
  let line = 0;
  const lines = byY.map((w, i) => (i > 0 && w.quad[0][1] - byY[i - 1]!.quad[0][1] >= 10 ? ++line : line));
  return byY.map((w, i) => ({ w, line: lines[i]!, x: w.quad[0][0] })).sort((a, b) => a.line - b.line || a.x - b.x).map((e) => e.w);
}

const median = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Groups words into rows after undoing the photo's tilt, and joins each row left to right: `to_lines` in
 * `.scratch/ocr-research/run_rapid.py`.
 */
export function toLines(words: { quad: Quad; text: string }[]): string {
  if (!words.length) return '';
  const angles = words.flatMap(({ quad: [a, b] }) => (Math.hypot(b[0] - a[0], b[1] - a[1]) > 30 ? [Math.atan2(b[1] - a[1], b[0] - a[0])] : []));
  const tilt = angles.length ? median(angles) : 0;
  const c = Math.cos(-tilt);
  const s = Math.sin(-tilt);
  const d = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const items = words
    .map(({ quad, text }) => {
      const cx = quad.reduce((a, p) => a + p[0], 0) / 4;
      const cy = quad.reduce((a, p) => a + p[1], 0) / 4;
      return { x: cx * c - cy * s, y: cx * s + cy * c, h: (d(quad[3], quad[0]) + d(quad[2], quad[1])) / 2, text };
    })
    .sort((a, b) => a.y - b.y);
  const rows: (typeof items)[] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.y - row.reduce((a, i) => a + i.y, 0) / row.length) < 0.5 * median([...row.map((i) => i.h), item.h])) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map((i) => i.text).join(' ')).join('\n');
}

/** Wraps two onnxruntime-web sessions; `ort` is the browser's `onnxruntime-web/wasm` or Node's `onnxruntime-web`. */
export async function ortSessions(ort: typeof Ort, det: Uint8Array, rec: Uint8Array): Promise<PpocrSessions> {
  const options: Ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const [detSession, recSession] = [await ort.InferenceSession.create(det, options), await ort.InferenceSession.create(rec, options)];
  const runner = (session: Ort.InferenceSession) => async (input: Float32Array, dims: number[]) => {
    const tensor = new ort.Tensor('float32', input, dims);
    const result = await session.run({ [session.inputNames[0]!]: tensor });
    const out = result[session.outputNames[0]!]!;
    const output = { data: out.data as Float32Array, dims: out.dims };
    tensor.dispose();
    return output;
  };
  return { det: runner(detSession), rec: runner(recSession) };
}
