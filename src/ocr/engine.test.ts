import { describe, expect, it } from 'vitest';
import { chooseEngine } from './engine';

describe('chooseEngine', () => {
  it('reads with PP-OCRv6 where WebAssembly SIMD is there', () => {
    expect(chooseEngine({ simd: true })).toBe('ppocr');
  });

  it('falls back to Tesseract without SIMD, as on iOS before 16.4', () => {
    expect(chooseEngine({ simd: false })).toBe('tesseract');
  });

  it('reads with Tesseract when the address asks for it', () => {
    expect(chooseEngine({ simd: true }, '?ocr=tesseract')).toBe('tesseract');
    expect(chooseEngine({ simd: true }, '?ocr=other')).toBe('ppocr');
  });
});
