export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ANALYSIS_LONG_SIDE = 320;

export function resizeGray(src: Uint8Array, width: number, height: number, newWidth: number, newHeight: number): Uint8Array {
  const out = new Uint8Array(newWidth * newHeight);
  const sx = width / newWidth;
  const sy = height / newHeight;
  for (let y = 0; y < newHeight; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < newWidth; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor((x + 1) * sx)));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += src[yy * width + xx]!;
      out[y * newWidth + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return out;
}

export function cropGray(src: Uint8Array, width: number, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * width + rect.x;
    out.set(src.subarray(from, from + rect.width), y * rect.width);
  }
  return out;
}

export function otsuThreshold(values: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of values) hist[v]!++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]!;
  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightBack += hist[t]!;
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;
    sumBack += t * hist[t]!;
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function findScreen(gray: Uint8Array, width: number, height: number): Rect | null {
  const scale = Math.min(1, ANALYSIS_LONG_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const small = scale < 1 ? resizeGray(gray, width, height, w, h) : gray;
  const threshold = otsuThreshold(small);
  let best =
    brightestPanel(small, w, h, threshold, false) ??
    brightestPanel(small, w, h, otsuThreshold(small.filter((v) => v <= threshold)), true);
  if (!best) return null;
  const inner = darkerInnerPanel(small, w, best) ?? enclosingDarkerPanel(small, w, h, best);
  if (inner) best = inner;

  const pad = 0.02;
  const x0 = Math.max(0, Math.floor((best.x - best.width * pad) / scale));
  const y0 = Math.max(0, Math.floor((best.y - best.height * pad) / scale));
  const x1 = Math.min(width, Math.ceil((best.x + best.width * (1 + pad)) / scale));
  const y1 = Math.min(height, Math.ceil((best.y + best.height * (1 + pad)) / scale));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * A silver PM4 case is brighter than its LCD, so the brightest panel can be the
 * case (or the whole photo). Look inside it for a large, darker, screen-shaped
 * region that doesn't touch the panel's edges: the LCD with its text.
 */
function darkerInnerPanel(small: Uint8Array, w: number, outer: Rect): Rect | null {
  const region = cropGray(small, w, outer);
  const threshold = otsuThreshold(region);
  const ow = outer.width;
  const oh = outer.height;
  const dark = new Uint8Array(ow * oh);
  for (let i = 0; i < dark.length; i++) dark[i] = region[i]! <= threshold ? 1 : 0;

  const seen = new Uint8Array(ow * oh);
  const stack: number[] = [];
  let best: { rect: Rect; area: number } | null = null;
  for (let start = 0; start < ow * oh; start++) {
    if (seen[start] || !dark[start]) continue;
    let minX = ow, minY = oh, maxX = 0, maxY = 0, area = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % ow;
      const y = (p - x) / ow;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [x > 0 ? p - 1 : -1, x < ow - 1 ? p + 1 : -1, y > 0 ? p - ow : -1, y < oh - 1 ? p + ow : -1]) {
        if (q >= 0 && !seen[q] && dark[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (minX === 0 || minY === 0 || maxX === ow - 1 || maxY === oh - 1) continue;
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const aspect = boxW / boxH;
    if (area / (boxW * boxH) < 0.6 || aspect < 0.7 || aspect > 1.6) continue;
    if (boxW * boxH < ow * oh * 0.15) continue;
    if (!best || area > best.area) best = { rect: { x: outer.x + minX, y: outer.y + minY, width: boxW, height: boxH }, area };
  }
  return best?.rect ?? null;
}

/**
 * Uneven light can leave only part of a silver PM4's LCD above the brightness
 * threshold, so the brightest panel is that part. When a darker screen-shaped
 * region in the whole photo contains it, that region is the LCD.
 */
function enclosingDarkerPanel(small: Uint8Array, w: number, h: number, part: Rect): Rect | null {
  const panel = darkerInnerPanel(small, w, { x: 0, y: 0, width: w, height: h });
  if (!panel) return null;
  const contains =
    part.x >= panel.x &&
    part.y >= panel.y &&
    part.x + part.width <= panel.x + panel.width &&
    part.y + part.height <= panel.y + panel.height;
  return contains ? panel : null;
}

function brightMask(small: Uint8Array, w: number, h: number, threshold: number, radius: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (small[y * w + x]! <= threshold) continue;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(h - 1, y + radius); yy++) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(w - 1, x + radius); xx++) mask[yy * w + xx] = 1;
      }
    }
  }
  return mask;
}

function brightestPanel(small: Uint8Array, w: number, h: number, threshold: number, nested: boolean): Rect | null {
  const bright = brightMask(small, w, h, threshold, nested ? 1 : 0);
  const labels = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let best: { rect: Rect; score: number } | null = null;

  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== -1 || !bright[start]) continue;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
    let touches = 0;
    labels[start] = start;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && labels[q] === -1 && bright[q]) {
          labels[q] = start;
          stack.push(q);
        }
      }
    }
    if (minX === 0) touches++;
    if (minY === 0) touches++;
    if (maxX === w - 1) touches++;
    if (maxY === h - 1) touches++;

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const fill = area / (boxW * boxH);
    const aspect = boxW / boxH;
    if ((nested && touches === 4) || fill < 0.45 || aspect < 0.5 || aspect > 2) continue;
    const score = area * fill * (touches >= 2 ? 0.25 : touches === 1 ? 0.8 : 1);
    if (!best || score > best.score) best = { rect: { x: minX, y: minY, width: boxW, height: boxH }, score };
  }

  if (!best || best.rect.width * best.rect.height < w * h * 0.04) return null;
  return best.rect;
}
