import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { relaxedSimd, simd } from 'wasm-feature-detect';
import { ocrEngine } from './engine';
import models from './ppocr/models.json';
import type { PpocrAssets } from './ppocr/ppocr.worker';

export const OCR_ASSET_DIR = `tesseract/${__OCR_VERSION__}/`;

const assetUrl = (path: string, base: string) => new URL(`${base}${path}`, globalThis.location?.href ?? 'http://localhost/').href;

export function ocrAssetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return assetUrl(`${OCR_ASSET_DIR}${path}`, base);
}

/**
 * PP-OCRv6's runtime, which Vite emits under `assets/` with a hash, and its models and dictionary in
 * `public/ppocr/`, named by their hash. All of them can be cached for good.
 */
export function ppocrAssets(base: string = import.meta.env.BASE_URL): PpocrAssets {
  return {
    wasm: new URL(ortWasmUrl, globalThis.location?.href ?? 'http://localhost/').href,
    det: assetUrl(`ppocr/${models.det.name}`, base),
    rec: assetUrl(`ppocr/${models.rec.name}`, base),
    dict: assetUrl(`ppocr/${models.dict.name}`, base),
  };
}

export function ocrAssetPaths(features: { simd: boolean; relaxedSimd: boolean }): string[] {
  const core = features.relaxedSimd ? 'relaxedsimd-lstm' : features.simd ? 'simd-lstm' : 'lstm';
  return ['worker.min.js', `core/tesseract-core-${core}.wasm.js`, 'lang/eng.traineddata.gz'];
}

/**
 * Fetches the device's OCR engine, so the service worker caches it for reading offline. Files already cached are
 * skipped: reading PP-OCRv6's 20 MB back on every start would only cost memory.
 */
export async function prefetchOcrAssets(): Promise<void> {
  const urls =
    (await ocrEngine()) === 'ppocr'
      ? Object.values(ppocrAssets())
      : ocrAssetPaths({ simd: await simd(), relaxedSimd: await relaxedSimd() }).map((p) => ocrAssetUrl(p));
  const missing = (await Promise.all(urls.map(async (url) => ((await caches.match(url)) ? [] : [url])))).flat();
  await Promise.all(missing.map((url) => fetch(url).then((r) => r.blob())));
}
