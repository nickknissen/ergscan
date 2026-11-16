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
    const { images, width, height } = ocrInputs(gray, 4, 4, { longSide: 4, blurRadius: 0, sensitivity: 0.15, cropWidth: null, detectScreen: true });
    expect([...new Set(images[0])]).toEqual([255]);
    expect(images[1]).toEqual(gray);
    expect([width, height]).toEqual([4, 4]);
  });

  it('crops to the screen and scales the crop to the requested width', () => {
    const width = 400;
    const height = 300;
    const gray = new Uint8Array(width * height).fill(30);
    for (let y = 100; y < 220; y++) for (let x = 120; x < 280; x++) gray[y * width + x] = 210;
    const result = ocrInputs(gray, width, height, { longSide: 400, blurRadius: 0, sensitivity: 0.15, cropWidth: 320, detectScreen: true });
    expect(result.width).toBe(320);
    expect(result.height).toBeGreaterThan(230);
    expect(result.height).toBeLessThan(260);
  });

  it('only scales an already framed image when screen detection is off', () => {
    const gray = new Uint8Array(400 * 300).fill(30);
    const result = ocrInputs(gray, 400, 300, { longSide: 400, blurRadius: 0, sensitivity: 0.15, cropWidth: 200, detectScreen: false });
    expect([result.width, result.height]).toEqual([200, 150]);
  });
});
