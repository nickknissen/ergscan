/**
 * PROTOTYPE (branch prototype/pp-ocrv6, throwaway): the geometry PP-OCRv6's text detector needs, in plain
 * TypeScript because OpenCV.js breaks the CSP. Ported from RapidOCR 3.10.0's `DBPostProcess`
 * (`rapidocr/ch_ppocr_det/utils.py`). See docs/research/ocr-accuracy.md, R2.
 */

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];

/**
 * The convex hull of each 8-connected component of `bitmap`. OpenCV's `findContours` (RETR_LIST) also returns
 * the borders of holes; those are skipped here, since a text blob from the detector has none worth a box.
 */
export function componentHulls(bitmap: Uint8Array, width: number, height: number): Point[][] {
  const seen = new Uint8Array(bitmap.length);
  const stack = new Int32Array(bitmap.length);
  const rowMin = new Int32Array(height).fill(width);
  const rowMax = new Int32Array(height).fill(-1);
  const hulls: Point[][] = [];
  for (let start = 0; start < bitmap.length; start++) {
    if (!bitmap[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let y0 = height;
    let y1 = -1;
    while (top) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      if (x < rowMin[y]!) rowMin[y] = x;
      if (x > rowMax[y]!) rowMax[y] = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const q = ny * width + nx;
          if (bitmap[q] && !seen[q]) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    // A component's hull is the hull of each row's two end pixels.
    const points: Point[] = [];
    for (let y = y0; y <= y1; y++) {
      points.push([rowMin[y]!, y]);
      if (rowMax[y] !== rowMin[y]) points.push([rowMax[y]!, y]);
      rowMin[y] = width;
      rowMax[y] = -1;
    }
    hulls.push(convexHull(points));
  }
  return hulls;
}

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain; collinear points dropped. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.slice().reverse())];
}

/** The smallest rectangle around a convex hull (rotating calipers): its corners and its shorter side. */
export function minAreaRect(hull: Point[]): { corners: Point[]; short: number } {
  if (hull.length === 1) return { corners: [hull[0]!, hull[0]!, hull[0]!, hull[0]!], short: 0 };
  let best: { area: number; ux: number; uy: number; u0: number; u1: number; v0: number; v1: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uy, u0, u1, v0, v1 };
  }
  if (!best) return { corners: [hull[0]!, hull[0]!, hull[0]!, hull[0]!], short: 0 };
  const { ux, uy, u0, u1, v0, v1 } = best;
  const at = (u: number, v: number): Point => [u * ux - v * uy, u * uy + v * ux];
  return { corners: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], short: Math.min(u1 - u0, v1 - v0) };
}

/** RapidOCR's `get_mini_boxes` ordering: top-left, top-right, bottom-right, bottom-left. */
export function miniBox(corners: Point[]): Quad {
  const p = corners.slice().sort((a, b) => a[0] - b[0]);
  const [i1, i4] = p[1]![1] > p[0]![1] ? [0, 1] : [1, 0];
  const [i2, i3] = p[3]![1] > p[2]![1] ? [2, 3] : [3, 2];
  return [p[i1]!, p[i2]!, p[i3]!, p[i4]!];
}

/** Mean of `prob` inside the box (RapidOCR's "fast" box score). */
export function boxScore(prob: Float32Array, width: number, height: number, box: Quad): number {
  const xs = box.map((p) => p[0]);
  const ys = box.map((p) => p[1]);
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
  const xmin = clamp(Math.floor(Math.min(...xs)), width - 1);
  const xmax = clamp(Math.ceil(Math.max(...xs)), width - 1);
  const ymin = clamp(Math.floor(Math.min(...ys)), height - 1);
  const ymax = clamp(Math.ceil(Math.max(...ys)), height - 1);
  const q = box.map(([x, y]) => [Math.trunc(x - xmin), Math.trunc(y - ymin)] as Point);
  let sum = 0;
  let count = 0;
  for (let y = 0; y <= ymax - ymin; y++) {
    for (let x = 0; x <= xmax - xmin; x++) {
      if (!insideConvex(q, x, y)) continue;
      sum += prob[(y + ymin) * width + x + xmin]!;
      count++;
    }
  }
  return count ? sum / count : 0;
}

function insideConvex(poly: Point[], x: number, y: number): boolean {
  let pos = false;
  let neg = false;
  for (let i = 0; i < poly.length; i++) {
    const c = cross(poly[i]!, poly[(i + 1) % poly.length]!, [x, y]);
    if (c > 1e-9) pos = true;
    else if (c < -1e-9) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

/**
 * Grows a rectangle by `area × ratio / perimeter` on every side. pyclipper's rounded offset, followed by a
 * minimum-area rectangle as RapidOCR does, comes to the same rectangle.
 */
export function unclip(box: Quad, ratio: number): { box: Quad; short: number } {
  const [a, b, , d] = box;
  const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const h = Math.hypot(d[0] - a[0], d[1] - a[1]);
  const distance = (w * h * ratio) / (2 * (w + h));
  const u: Point = [(b[0] - a[0]) / w, (b[1] - a[1]) / w];
  const v: Point = [(d[0] - a[0]) / h, (d[1] - a[1]) / h];
  const signs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const grown = box.map(([x, y], i) => {
    const [su, sv] = signs[i]!;
    return [x + distance * (su * u[0] + sv * v[0]), y + distance * (su * u[1] + sv * v[1])] as Point;
  });
  return { box: miniBox(grown), short: Math.min(w, h) + 2 * distance };
}

/** imutils' `order_points_clockwise`, as RapidOCR's `filter_det_res` uses it. */
export function orderClockwise(points: Point[]): Quad {
  const byX = points.slice().sort((a, b) => a[0] - b[0]);
  const [tl, bl] = byX.slice(0, 2).sort((a, b) => a[1] - b[1]);
  const [tr, br] = byX.slice(2).sort((a, b) => a[1] - b[1]);
  return [tl!, tr!, br!, bl!];
}

/** The 3×3 homography taking `from[i]` to `to[i]` (OpenCV's `getPerspectiveTransform`). */
export function perspective(from: Point[], to: Point[]): number[] {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!;
    const [u, v] = to[i]!;
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < 9; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return [...Array.from({ length: 8 }, (_, i) => a[i]![8]! / a[i]![i]!), 1];
}

export function applyPerspective(m: number[], x: number, y: number): Point {
  const w = m[6]! * x + m[7]! * y + m[8]!;
  return [(m[0]! * x + m[1]! * y + m[2]!) / w, (m[3]! * x + m[4]! * y + m[5]!) / w];
}

/** Python's `round` and NumPy's `np.round`: halves go to the even neighbour. */
export function roundHalfEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
