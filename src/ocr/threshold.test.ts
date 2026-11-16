import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, toGrayscale } from './threshold';

describe('toGrayscale', () => {
  it('uses luma weights', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 200, 200, 200, 255]);
    expect([...toGrayscale(rgba)]).toEqual([76, 150, 29, 200]);
  });
});

describe('adaptiveThreshold', () => {
  it('separates dark glyphs from an unevenly lit background', () => {
    const width = 64;
    const height = 64;
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const background = 120 + x * 2;
        const glyph = (x >= 10 && x < 14 && y >= 20 && y < 40) || (x >= 50 && x < 54 && y >= 20 && y < 40);
        gray[y * width + x] = glyph ? background - 70 : background;
      }
    }
    const out = adaptiveThreshold(gray, width, height);
    expect(out[30 * width + 12]).toBe(0);
    expect(out[30 * width + 52]).toBe(0);
    expect(out[5 * width + 5]).toBe(255);
    expect(out[5 * width + 60]).toBe(255);
    expect(out[30 * width + 30]).toBe(255);
  });
});
