import { describe, expect, it } from 'vitest';
import { cropGray, findScreen, otsuThreshold, resizeGray } from './crop';

function scene(width: number, height: number) {
  const gray = new Uint8Array(width * height).fill(40);
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gray[y * width + x] = v;
  };
  return { gray, fill };
}

describe('otsuThreshold', () => {
  it('splits a bimodal image between its two levels', () => {
    const values = new Uint8Array([...new Array(50).fill(30), ...new Array(50).fill(220)]);
    const t = otsuThreshold(values);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });
});

describe('resizeGray and cropGray', () => {
  it('averages blocks when downscaling', () => {
    const src = new Uint8Array([0, 100, 200, 100]);
    expect([...resizeGray(src, 2, 2, 1, 1)]).toEqual([100]);
  });

  it('copies the requested rectangle', () => {
    const src = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...cropGray(src, 3, { x: 1, y: 1, width: 2, height: 2 })]).toEqual([5, 6, 8, 9]);
  });
});

describe('findScreen', () => {
  it('finds the bright LCD inside a dark bezel and ignores a bright wall touching the edges', () => {
    const width = 800;
    const height = 1000;
    const { gray, fill } = scene(width, height);
    fill(0, 0, width, 180, 200);
    fill(200, 400, 600, 760, 215);
    for (let row = 0; row < 6; row++) fill(240, 440 + row * 50, 560, 460 + row * 50, 50);

    const rect = findScreen(gray, width, height)!;
    expect(rect.x).toBeGreaterThan(180);
    expect(rect.x).toBeLessThan(205);
    expect(rect.y).toBeGreaterThan(380);
    expect(rect.y).toBeLessThan(405);
    expect(rect.x + rect.width).toBeGreaterThan(595);
    expect(rect.x + rect.width).toBeLessThan(620);
    expect(rect.y + rect.height).toBeGreaterThan(755);
    expect(rect.y + rect.height).toBeLessThan(780);
  });

  it('returns null when nothing screen-like is present', () => {
    const { gray } = scene(100, 100);
    expect(findScreen(gray, 100, 100)).toBeNull();
  });
});
