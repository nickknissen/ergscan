import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';

export type OcrProgress = (status: string, progress: number) => void;

let workerPromise: Promise<Worker> | null = null;
const listeners = new Set<OcrProgress>();

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}tesseract/${path}`, window.location.href).href;
}

export function getOcrWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: assetUrl('worker.min.js'),
      corePath: assetUrl('core/'),
      langPath: assetUrl('lang/'),
      workerBlobURL: false,
      logger: (m) => listeners.forEach((l) => l(m.status, m.progress)),
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
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
