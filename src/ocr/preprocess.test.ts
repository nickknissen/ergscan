import { describe, expect, it } from 'vitest';
import { boxBlur, ocrInputs } from './preprocess';

describe('boxBlur', () => {
  it('returns the input untouched for radius 0', () => {
    const src = new Uint8Array([0, 255, 0, 255]);
    expect(boxBlur(src, 2, 2, 0)).toBe(src);
  });

  it('keeps a flat image flat', () => {
    const src = new Uint8Array(25).fill(120);
    expect([...boxBlur(src, 5, 5, 1)]).toEqual(new Array(25).fill(120));
  });

  it('merges isolated dots into a connected blob', () => {
    const width = 9;
    const src = new Uint8Array(width * width).fill(255);
    src[4 * width + 3] = 0;
    src[4 * width + 5] = 0;
    const out = boxBlur(src, width, width, 1, 1);
    expect(out[4 * width + 4]).toBeLessThan(255);
    expect(out[0]).toBe(255);
  });
});

describe('ocrInputs', () => {
  it('produces a thresholded image first and the grayscale fallback second', () => {
    const gray = new Uint8Array(16).fill(200);
    const [binary, fallback] = ocrInputs(gray, 4, 4);
    expect([...new Set(binary)]).toEqual([255]);
    expect(fallback).toEqual(gray);
  });
});
