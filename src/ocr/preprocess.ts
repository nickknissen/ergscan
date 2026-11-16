import { adaptiveThreshold } from './threshold';

export interface PreprocessOptions {
  longSide: number;
  blurRadius: number;
  sensitivity: number;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
  longSide: 2000,
  blurRadius: 0,
  sensitivity: 0.15,
};

export function boxBlur(src: Uint8Array, width: number, height: number, radius: number, passes = 3): Uint8Array {
  if (radius <= 0) return src;
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    blurLine(a, b, width, height, radius, 1, width);
    blurLine(b, a, height, width, radius, width, 1);
  }
  return Uint8Array.from(a, (v) => Math.round(v));
}

function blurLine(src: Float32Array, dst: Float32Array, length: number, lines: number, r: number, step: number, lineStep: number): void {
  const size = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    const at = (i: number) => src[base + Math.min(length - 1, Math.max(0, i)) * step]!;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += at(i);
    for (let i = 0; i < length; i++) {
      dst[base + i * step] = sum / size;
      sum += at(i + r + 1) - at(i - r);
    }
  }
}

export function ocrInputs(gray: Uint8Array, width: number, height: number, options: PreprocessOptions = DEFAULT_PREPROCESS): Uint8Array[] {
  const blurred = boxBlur(gray, width, height, options.blurRadius);
  return [adaptiveThreshold(blurred, width, height, options.sensitivity), blurred];
}
