import { relaxedSimd, simd } from 'wasm-feature-detect';

export const OCR_ASSET_DIR = `tesseract/${__OCR_VERSION__}/`;

export function ocrAssetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return new URL(`${base}${OCR_ASSET_DIR}${path}`, globalThis.location?.href ?? 'http://localhost/').href;
}

export function ocrAssetPaths(features: { simd: boolean; relaxedSimd: boolean }): string[] {
  const core = features.relaxedSimd ? 'relaxedsimd-lstm' : features.simd ? 'simd-lstm' : 'lstm';
  return ['worker.min.js', `core/tesseract-core-${core}.wasm.js`, 'lang/eng.traineddata.gz'];
}

export async function prefetchOcrAssets(): Promise<void> {
  const paths = ocrAssetPaths({ simd: await simd(), relaxedSimd: await relaxedSimd() });
  await Promise.all(paths.map((p) => fetch(ocrAssetUrl(p)).then((r) => r.blob())));
}
