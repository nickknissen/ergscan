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

  it('finds a grey LCD with ruled lines below a white page in a screenshot', () => {
    const width = 640;
    const height = 640;
    const { gray, fill } = scene(width, height);
    fill(0, 0, width, 260, 250);
    fill(0, 260, width, height, 150);
    fill(160, 300, 480, 620, 30);
    fill(200, 340, 440, 580, 160);
    fill(210, 400, 430, 402, 40);
    fill(210, 440, 430, 442, 40);
    fill(210, 350, 212, 570, 40);

    const rect = findScreen(gray, width, height)!;
    expect(rect.x).toBeGreaterThan(185);
    expect(rect.x).toBeLessThan(200);
    expect(rect.y).toBeGreaterThan(325);
    expect(rect.y).toBeLessThan(340);
    expect(rect.x + rect.width).toBeGreaterThan(440);
    expect(rect.x + rect.width).toBeLessThan(455);
    expect(rect.y + rect.height).toBeGreaterThan(580);
    expect(rect.y + rect.height).toBeLessThan(595);
  });

  it('finds the darker LCD inside a silver PM4 case that is brighter than the screen', () => {
    const width = 800;
    const height = 1000;
    const { gray, fill } = scene(width, height);
    fill(60, 150, 740, 900, 210);
    fill(150, 300, 650, 780, 120);
    for (let row = 0; row < 6; row++) fill(200, 340 + row * 70, 600, 370 + row * 70, 40);

    const rect = findScreen(gray, width, height)!;
    expect(rect.x).toBeGreaterThan(130);
    expect(rect.x).toBeLessThan(155);
    expect(rect.y).toBeGreaterThan(280);
    expect(rect.y).toBeLessThan(305);
    expect(rect.x + rect.width).toBeGreaterThan(645);
    expect(rect.x + rect.width).toBeLessThan(670);
    expect(rect.y + rect.height).toBeGreaterThan(775);
    expect(rect.y + rect.height).toBeLessThan(800);
  });

  it('finds the whole PM4 LCD when uneven light leaves only part of it bright', () => {
    const width = 800;
    const height = 1000;
    const { gray, fill } = scene(width, height);
    fill(60, 250, 740, 830, 210);
    fill(100, 300, 700, 780, 30);
    fill(110, 310, 340, 770, 200);
    fill(340, 310, 690, 770, 70);

    const rect = findScreen(gray, width, height)!;
    expect(rect.x).toBeGreaterThan(80);
    expect(rect.x).toBeLessThan(105);
    expect(rect.y).toBeGreaterThan(280);
    expect(rect.y).toBeLessThan(305);
    expect(rect.x + rect.width).toBeGreaterThan(695);
    expect(rect.x + rect.width).toBeLessThan(720);
    expect(rect.y + rect.height).toBeGreaterThan(775);
    expect(rect.y + rect.height).toBeLessThan(800);
  });

  it('returns null when nothing screen-like is present', () => {
    const { gray } = scene(100, 100);
    expect(findScreen(gray, 100, 100)).toBeNull();
  });
});
