import { createWorker, type Worker } from 'tesseract.js';
import { ocrAssetUrl } from './assets';
import { OCR_ENGINE, OCR_PARAMS } from './ocrConfig';

export type OcrProgress = (status: string, progress: number) => void;

let workerPromise: Promise<Worker> | null = null;
const listeners = new Set<OcrProgress>();

export function getOcrWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const worker = await createWorker('eng', OCR_ENGINE, {
      workerPath: ocrAssetUrl('worker.min.js'),
      corePath: ocrAssetUrl('core/'),
      langPath: ocrAssetUrl('lang/'),
      workerBlobURL: false,
      logger: (m) => listeners.forEach((l) => l(m.status, m.progress)),
    });
    await worker.setParameters(OCR_PARAMS);
    return worker;
  })().catch((error: unknown) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

export async function recognizeText(image: HTMLCanvasElement, onProgress?: OcrProgress): Promise<string> {
  if (onProgress) listeners.add(onProgress);
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    if (onProgress) listeners.delete(onProgress);
  }
}
