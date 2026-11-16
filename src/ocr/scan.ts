import { parsePm5Text, type ParsedScan } from '../core/pm5Parser';
import { recognizeText, type OcrProgress } from './tesseract';
import { adaptiveThreshold, toGrayscale } from './threshold';

const TARGET_LONG_SIDE = 2000;

export interface ScanOutcome {
  scan: ParsedScan | null;
  text: string;
}

export async function firstParsed(attempts: (() => Promise<string>)[]): Promise<ScanOutcome> {
  const rank = (o: ScanOutcome) => (o.scan ? o.scan.rows.length + 1 : 0);
  let best: ScanOutcome = { scan: null, text: '' };
  for (const attempt of attempts) {
    const text = await attempt();
    const candidate = { scan: parsePm5Text(text), text };
    const better = rank(candidate) > rank(best) || (rank(best) === 0 && !candidate.scan && text.length > best.text.length);
    if (better) best = candidate;
    if (rank(best) > 1) break;
  }
  return best;
}

export async function scanImage(image: Blob, onProgress?: OcrProgress): Promise<ScanOutcome> {
  const { gray, binary } = await prepareImages(image);
  return firstParsed([() => recognizeText(binary, onProgress), () => recognizeText(gray, onProgress)]);
}

async function prepareImages(image: Blob): Promise<{ gray: HTMLCanvasElement; binary: HTMLCanvasElement }> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const scale = TARGET_LONG_SIDE / Math.max(bitmap.width, bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const source = canvasOf(width, height);
  const ctx = source.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const gray = toGrayscale(ctx.getImageData(0, 0, width, height).data);
  return {
    gray: canvasFromGray(gray, width, height),
    binary: canvasFromGray(adaptiveThreshold(gray, width, height), width, height),
  };
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasFromGray(values: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(width, height);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
