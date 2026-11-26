import { simd } from 'wasm-feature-detect';

export type OcrEngine = 'ppocr' | 'tesseract';

/**
 * PP-OCRv6 where the browser has WebAssembly SIMD, which every onnxruntime-web build needs (Safari from iOS 16.4,
 * Chrome from 91, Firefox from 89); Tesseract elsewhere. `?ocr=tesseract` in the address picks Tesseract, to
 * compare the two on one device.
 */
export function chooseEngine(features: { simd: boolean }, search = ''): OcrEngine {
  if (new URLSearchParams(search).get('ocr') === 'tesseract') return 'tesseract';
  return features.simd ? 'ppocr' : 'tesseract';
}

export async function ocrEngine(): Promise<OcrEngine> {
  return chooseEngine({ simd: await simd() }, globalThis.location?.search);
}
