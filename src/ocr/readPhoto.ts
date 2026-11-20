import { addsUp, scanTrust } from '../core/scanTrust';
import { cropGray } from './crop';
import { firstParsed, type ScanOutcome } from './firstParsed';
import { headingSearchImage, tableRectFromWords, type WordBox } from './headerRow';
import { DEFAULT_PREPROCESS, ocrInputs, type OcrInputs, type PreprocessOptions } from './preprocess';

export interface GrayImage {
  values: Uint8Array;
  width: number;
  height: number;
}

/** The OCR engine as reading a photo needs it: page text, and the words with their boxes. */
export interface Recognizer {
  text(image: GrayImage): Promise<string>;
  words(image: GrayImage): Promise<WordBox[]>;
}

function readInputs(inputs: OcrInputs, ocr: Recognizer): Promise<ScanOutcome> {
  return firstParsed(inputs.images.map((values) => () => ocr.text({ values, width: inputs.width, height: inputs.height })));
}

/**
 * Reads the results table from a grayscale photo. It reads the detected screen first; when
 * that read doesn't add up, it finds the table by its heading row, reads that crop too, and
 * keeps whichever read has more fields that check out.
 */
export async function readPhoto(gray: Uint8Array, width: number, height: number, ocr: Recognizer, options: PreprocessOptions = DEFAULT_PREPROCESS): Promise<ScanOutcome> {
  const first = await readInputs(ocrInputs(gray, width, height, options), ocr);
  if (!options.detectScreen || addsUp(first.scan)) return first;

  const search = headingSearchImage(gray, width, height, options.sensitivity);
  const rect = tableRectFromWords(await ocr.words(search), search, width, height);
  if (!rect || rect.width < 1 || rect.height < 1) return first;
  const table = ocrInputs(cropGray(gray, width, rect), rect.width, rect.height, { ...options, detectScreen: false });
  const second = await readInputs(table, ocr);
  return scanTrust(second.scan) > scanTrust(first.scan) ? second : first;
}
