import { resizeGray, type Rect } from './crop';
import { boxBlur } from './preprocess';
import { adaptiveThreshold } from './threshold';

/** A word Tesseract found, with its bounding box in pixels. */
export interface WordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The results table's column-heading row ("time meter /500m s/m"), widened to the columns below it. */
export interface HeaderRow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Distance between table rows below the heading, in pixels. */
  pitch: number;
}

const SEARCH_LONG_SIDE = 1600;
const HEADING = /^(time|tiempo|temps|zeit|tid|tijd|meters?|metros|m[eè]tres?|\/?[15]000?m|s\/m|cal(\/hr)?|calhr|watts?|vatios)$/;

export function isHeadingWord(text: string): boolean {
  return HEADING.test(text.toLowerCase().replace(/[^a-z0-9/è]/g, ''));
}

const centerY = (w: WordBox) => (w.y0 + w.y1) / 2;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/** Median distance between successive numbers stacked below the heading words: the table's row pitch. */
function rowPitch(heads: WordBox[], words: WordBox[]): number | null {
  const steps: number[] = [];
  for (const head of heads) {
    const column = words
      .filter((w) => w.y0 > head.y1 - 2 && w.x1 > head.x0 && w.x0 < head.x1 && /\d/.test(w.text))
      .map(centerY)
      .sort((a, b) => a - b);
    const minStep = (head.y1 - head.y0) * 0.6;
    for (let i = 1; i < column.length; i++) {
      const step = column[i]! - column[i - 1]!;
      if (step > minStep) steps.push(step);
    }
  }
  return steps.length >= 3 ? median(steps) : null;
}

/** Finds the line with the most distinct heading words, widened to the words on that line and the numbers below it. */
export function findHeaderRow(words: WordBox[]): HeaderRow | null {
  const heads = words.filter((w) => isHeadingWord(w.text) && w.y1 > w.y0);
  const distinct = (ws: WordBox[]) => new Set(ws.map((w) => w.text.toLowerCase())).size;
  let best: WordBox[] = [];
  for (const anchor of heads) {
    const tolerance = (anchor.y1 - anchor.y0) * 0.6;
    const line = heads.filter((w) => Math.abs(centerY(w) - centerY(anchor)) < tolerance);
    if (distinct(line) > distinct(best)) best = line;
  }
  if (distinct(best) < 2) return null;

  const pitch = rowPitch(best, words) ?? median(best.map((w) => w.y1 - w.y0));
  const cy = median(best.map(centerY));
  const sameLine = words.filter((w) => Math.abs(centerY(w) - cy) < pitch * 0.35 && w.x1 - w.x0 < pitch * 5);
  const bottom = Math.max(...best.map((w) => w.y1));
  const rowsBelow = words.filter(
    (w) => w.y0 > bottom - 2 && w.y1 < bottom + pitch * 10 && /\d/.test(w.text) && w.x1 - w.x0 < pitch * 5 && w.y1 - w.y0 < pitch * 1.5,
  );
  const row = [...best, ...sameLine, ...rowsBelow];
  return {
    x0: Math.min(...row.map((w) => w.x0)),
    y0: Math.min(...best.map((w) => w.y0)),
    x1: Math.max(...row.map((w) => w.x1)),
    y1: Math.max(...best.map((w) => w.y1)),
    pitch,
  };
}

/** The table area implied by a heading row: title and date above it, up to nine rows below. */
export function tableRectFromHeader(header: HeaderRow, width: number, height: number): Rect {
  const p = header.pitch;
  const cx = (header.x0 + header.x1) / 2;
  const half = Math.max(((header.x1 - header.x0) / 2) * 1.3, p * 6.5);
  const x0 = Math.max(0, Math.round(cx - half));
  const x1 = Math.min(width, Math.round(cx + half));
  const y0 = Math.max(0, Math.round(header.y0 - p * 4));
  const y1 = Math.min(height, Math.round(header.y1 + p * 10.5));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** A small thresholded copy of the whole photo for a quick word search; `scale` maps it back to the photo. */
export function headingSearchImage(gray: Uint8Array, width: number, height: number, sensitivity: number) {
  const scale = Math.min(1, SEARCH_LONG_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const small = scale < 1 ? resizeGray(gray, width, height, w, h) : gray;
  return { values: adaptiveThreshold(boxBlur(small, w, h, 1), w, h, sensitivity), width: w, height: h, scale };
}

/** The photo rectangle around the results table, from the words found in its heading search image. */
export function tableRectFromWords(words: WordBox[], search: { width: number; height: number; scale: number }, width: number, height: number): Rect | null {
  const header = findHeaderRow(words);
  if (!header) return null;
  const r = tableRectFromHeader(header, search.width, search.height);
  const x = Math.round(r.x / search.scale);
  const y = Math.round(r.y / search.scale);
  return { x, y, width: Math.min(Math.round(r.width / search.scale), width - x), height: Math.min(Math.round(r.height / search.scale), height - y) };
}
