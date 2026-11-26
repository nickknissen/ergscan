/**
 * Reads a photo with PP-OCRv6 tiny in a worker. The whole photo goes in at 1000 px on its long side, in colour,
 * with none of Tesseract's preprocessing: the detector finds the text wherever it is, and straightens each box
 * before reading it. A photo taken in the app's camera frame goes in at 800 px wide.
 */
import { parsePm5Text } from '../../core/pm5Parser';
import { ppocrAssets } from '../assets';
import type { ScanOutcome } from '../firstParsed';
import type { OcrProgress } from '../tesseract';
import { PPOCR_FRAMED_SETTINGS, PPOCR_FRAMED_WIDTH, PPOCR_LONG_SIDE, PPOCR_SETTINGS, type RgbaImage } from './pipeline';
import type { PpocrReply, PpocrRequest } from './ppocr.worker';

let worker: Worker | null = null;
let nextId = 0;

async function loadRgba(image: Blob, framed: boolean): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const scale = framed ? PPOCR_FRAMED_WIDTH / bitmap.width : Math.min(1, PPOCR_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

function read(image: RgbaImage, framed: boolean, onProgress?: OcrProgress): Promise<string> {
  const w = (worker ??= new Worker(new URL('./ppocr.worker.ts', import.meta.url), { type: 'module', name: 'ppocr' }));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = ({ data }: MessageEvent<PpocrReply>) => {
      if (data.id !== id) return;
      if ('progress' in data) return onProgress?.('recognizing text', data.progress);
      done();
      if ('error' in data) reject(new Error(data.error));
      else resolve(data.text);
    };
    const onError = (event: ErrorEvent) => {
      done();
      w.terminate();
      worker = null;
      reject(new Error(`PP-OCR worker failed: ${event.message || 'could not start'}`));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    const request: PpocrRequest = {
      id,
      image,
      settings: framed ? PPOCR_FRAMED_SETTINGS : PPOCR_SETTINGS,
      assets: ppocrAssets(),
    };
    w.postMessage(request, [image.data.buffer]);
  });
}

export async function scanImagePpocr(image: Blob, onProgress?: OcrProgress, framed = false): Promise<ScanOutcome> {
  const text = await read(await loadRgba(image, framed), framed, onProgress);
  return { scan: parsePm5Text(text), text };
}
