import { describe, expect, it } from 'vitest';
import { applyPerspective, componentHulls, convexHull, minAreaRect, orderClockwise, perspective, roundHalfEven, unclip, type Point, type Quad } from './geometry';

const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('componentHulls', () => {
  it('finds each 8-connected blob, touching corners included', () => {
    const width = 8;
    const bitmap = new Uint8Array(width * 4);
    // A 3×2 block, and a diagonal pair apart from it.
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [5, 2], [6, 3]]) bitmap[y! * width + x!] = 1;
    const hulls = componentHulls(bitmap, width, 4);
    expect(hulls).toHaveLength(2);
    expect(minAreaRect(hulls[0]!).short).toBeCloseTo(1);
    expect(hulls[1]).toEqual(expect.arrayContaining([[5, 2], [6, 3]]));
  });
});

describe('convexHull', () => {
  it('keeps the corners and drops points inside or along an edge', () => {
    const hull = convexHull([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3], [2, 1]]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(expect.arrayContaining([[0, 0], [4, 0], [4, 3], [0, 3]]));
  });
});

describe('minAreaRect', () => {
  it('fits a tilted rectangle exactly', () => {
    const a = Math.PI / 6;
    const corner = (u: number, v: number): Point => [10 + u * Math.cos(a) - v * Math.sin(a), 20 + u * Math.sin(a) + v * Math.cos(a)];
    const rect = minAreaRect(convexHull([corner(0, 0), corner(40, 0), corner(40, 10), corner(0, 10), corner(20, 5)]));
    expect(rect.short).toBeCloseTo(10, 6);
    const sides = rect.corners.map((p, i) => Math.hypot(p[0] - rect.corners[(i + 1) % 4]![0], p[1] - rect.corners[(i + 1) % 4]![1]));
    expect(sides.map((s) => Math.round(s)).sort((x, y) => x - y)).toEqual([10, 10, 40, 40]);
  });
});

describe('unclip', () => {
  it('grows each side by area × ratio / perimeter', () => {
    const box: Quad = [[0, 0], [40, 0], [40, 10], [0, 10]];
    const { box: grown, short } = unclip(box, 1.6);
    const d = (40 * 10 * 1.6) / (2 * 50);
    expect(short).toBeCloseTo(10 + 2 * d);
    close(grown[0], [-d, -d]);
    close(grown[2], [40 + d, 10 + d]);
  });
});

describe('orderClockwise', () => {
  it('starts at the top left', () => {
    expect(orderClockwise([[9, 9], [0, 1], [9, 0], [1, 8]])).toEqual([[0, 1], [9, 0], [9, 9], [1, 8]]);
  });
});

describe('perspective', () => {
  it('maps each corner onto its target', () => {
    const from: Point[] = [[0, 0], [100, 0], [100, 30], [0, 30]];
    const to: Point[] = [[12, 40], [118, 52], [110, 85], [8, 70]];
    const m = perspective(from, to);
    from.forEach((p, i) => close(applyPerspective(m, ...p), to[i]!));
  });
});

describe('roundHalfEven', () => {
  it('rounds halves to the even neighbour, as Python does', () => {
    expect([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(roundHalfEven)).toEqual([0, 2, 2, 4, 2, 3]);
  });
});
