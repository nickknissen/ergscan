import type { ScanOutcome } from './firstParsed';
import { DEFAULT_PREPROCESS } from './preprocess';
import { readPhoto, type GrayImage } from './readPhoto';
import { recognizeText, recognizeWords, type OcrProgress } from './tesseract';
import { toGrayscale } from './threshold';

export type { ScanOutcome } from './firstParsed';

export async function scanImage(image: Blob, onProgress?: OcrProgress, framed = false): Promise<ScanOutcome> {
  const { gray, width, height } = await loadGray(image, DEFAULT_PREPROCESS.longSide);
  return readPhoto(
    gray,
    width,
    height,
    {
      text: (img) => recognizeText(canvasFromGray(img), onProgress),
      words: (img) => recognizeWords(canvasFromGray(img)),
    },
    { ...DEFAULT_PREPROCESS, detectScreen: !framed },
  );
}

async function loadGray(image: Blob, longSide: number): Promise<{ gray: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const scale = longSide / Math.max(bitmap.width, bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { gray: toGrayscale(ctx.getImageData(0, 0, width, height).data), width, height };
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasFromGray({ values, width, height }: GrayImage): HTMLCanvasElement {
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
