import { ocrEngine } from './engine';
import type { ScanOutcome } from './firstParsed';
import type { OcrProgress } from './tesseract';

export type { ScanOutcome } from './firstParsed';

let ppocrFailed = false;

/**
 * Reads a photo with the device's engine: PP-OCRv6 where it runs, Tesseract elsewhere. When PP-OCRv6 fails (its
 * files didn't load, or the worker died), Tesseract reads this photo and the rest of the session's.
 */
export async function scanImage(image: Blob, onProgress?: OcrProgress, framed = false): Promise<ScanOutcome> {
  if (!ppocrFailed && (await ocrEngine()) === 'ppocr') {
    try {
      const { scanImagePpocr } = await import('./ppocr/scan');
      return await scanImagePpocr(image, onProgress, framed);
    } catch (error) {
      ppocrFailed = true;
      console.warn('PP-OCRv6 failed, reading with Tesseract', error);
    }
  }
  const { scanImageTesseract } = await import('./scanTesseract');
  return scanImageTesseract(image, onProgress, framed);
}
