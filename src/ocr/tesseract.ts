import { createWorker, PSM, type Worker } from 'tesseract.js';
import { ocrAssetUrl } from './assets';
import type { WordBox } from './headerRow';
import { OCR_ENGINE, OCR_PARAMS, wordBoxes } from './ocrConfig';

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

/** Words and their boxes from a sparse-text pass, for finding the table's heading row anywhere in the photo. */
export async function recognizeWords(image: HTMLCanvasElement): Promise<WordBox[]> {
  const worker = await getOcrWorker();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
    return wordBoxes(data.blocks);
  } finally {
    await worker.setParameters(OCR_PARAMS);
  }
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
