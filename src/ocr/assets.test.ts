import { describe, expect, it } from 'vitest';
import { ocrAssetPaths, ocrAssetUrl } from './assets';

describe('ocrAssetPaths', () => {
  it('picks the same LSTM core variant tesseract.js loads for the device', () => {
    expect(ocrAssetPaths({ simd: true, relaxedSimd: true })).toContain('core/tesseract-core-relaxedsimd-lstm.wasm.js');
    expect(ocrAssetPaths({ simd: true, relaxedSimd: false })).toContain('core/tesseract-core-simd-lstm.wasm.js');
    expect(ocrAssetPaths({ simd: false, relaxedSimd: false })).toContain('core/tesseract-core-lstm.wasm.js');
  });

  it('always includes the worker and English model', () => {
    expect(ocrAssetPaths({ simd: false, relaxedSimd: false })).toEqual(
      expect.arrayContaining(['worker.min.js', 'lang/eng.traineddata.gz']),
    );
  });
});

describe('ocrAssetUrl', () => {
  it('resolves under the app base path', () => {
    expect(ocrAssetUrl('worker.min.js', '/ergscan/')).toBe(`http://localhost/ergscan/tesseract/${__OCR_VERSION__}/worker.min.js`);
  });
});
