/**
 * PROTOTYPE (branch prototype/pp-ocrv6, throwaway): reads a photo with PP-OCRv6 tiny instead of Tesseract when the
 * address has `?ocr=ppocr`. The whole photo goes in at 1000 px on its long side, in colour, with none of
 * Tesseract's preprocessing; a photo taken in the camera frame goes in at 800 px wide. Timings and memory are
 * added under the raw text. Remove afterwards; see docs/research/ocr-accuracy.md, R2.
 */
import { parsePm5Text } from '../../core/pm5Parser';
import type { ScanOutcome } from '../firstParsed';
import type { OcrProgress } from '../tesseract';
import models from './models.json';
import { PPOCR_FRAMED_WIDTH, PPOCR_LONG_SIDE, type RgbaImage } from './pipeline';
import type { PpocrReply, PpocrRequest, PpocrResult } from './ppocr.worker';

let worker: Worker | null = null;
let nextId = 0;

const assetUrl = (name: string) => new URL(`${import.meta.env.BASE_URL}ppocr/${name}`, location.href).href;

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

function read(image: RgbaImage, onProgress?: OcrProgress): Promise<PpocrResult> {
  const w = (worker ??= new Worker(new URL('./ppocr.worker.ts', import.meta.url), { type: 'module', name: 'ppocr-prototype' }));
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
      else resolve(data.result);
    };
    const onError = (event: ErrorEvent) => {
      done();
      worker = null;
      reject(new Error(`PP-OCR worker failed: ${event.message || 'could not start'}`));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    const request: PpocrRequest = {
      id,
      image,
      assets: { wasm: assetUrl(`ort-wasm-simd-threaded-${__ORT_VERSION__}.wasm`), det: assetUrl(models.det.name), rec: assetUrl(models.rec.name), dict: assetUrl(models.dict.name) },
    };
    w.postMessage(request, [image.data.buffer]);
  });
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function report(r: PpocrResult, image: { width: number; height: number }, decodeMs: number, totalMs: number): string {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return [
    `[PP-OCRv6 prototype] ${r.loadMs === null ? 'runtime already loaded' : `runtime and models loaded in ${seconds(r.loadMs)}`}`,
    `photo ${image.width}×${image.height} decoded in ${seconds(decodeMs)}; detect ${seconds(r.detMs)} at ${r.detSize.join('×')}; recognise ${seconds(r.recMs)}, ${r.boxes} boxes; total ${seconds(totalMs)}`,
    `WebAssembly memory ${r.wasmBytes === null ? 'unknown' : `${Math.round(r.wasmBytes / 2 ** 20)} MB`}; ${nav.hardwareConcurrency ?? '?'} cores, ${nav.deviceMemory ?? '?'} GB; ${navigator.userAgent}`,
  ].join('\n');
}

export async function scanImagePpocr(image: Blob, onProgress?: OcrProgress, framed = false): Promise<ScanOutcome> {
  const started = performance.now();
  const rgba = await loadRgba(image, framed);
  const decodeMs = performance.now() - started;
  const size = { width: rgba.width, height: rgba.height };
  const result = await read(rgba, onProgress);
  const stats = report(result, size, decodeMs, performance.now() - started);
  console.info(stats);
  return { scan: parsePm5Text(result.text), text: `${result.text}\n\n${stats}` };
}
