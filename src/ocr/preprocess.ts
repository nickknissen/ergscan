import { cropGray, findScreen, resizeGray } from './crop';
import { adaptiveThreshold } from './threshold';

export interface PreprocessOptions {
  longSide: number;
  blurRadius: number;
  sensitivity: number;
  cropWidth: number | null;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
  longSide: 3000,
  blurRadius: 2,
  sensitivity: 0.1,
  cropWidth: 1300,
};

export interface OcrInputs {
  images: Uint8Array[];
  width: number;
  height: number;
}

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

function cropToScreen(gray: Uint8Array, width: number, height: number, cropWidth: number) {
  const rect = findScreen(gray, width, height);
  if (!rect) return { gray, width, height };
  const cropped = cropGray(gray, width, rect);
  const newHeight = Math.round((rect.height * cropWidth) / rect.width);
  return { gray: resizeGray(cropped, rect.width, rect.height, cropWidth, newHeight), width: cropWidth, height: newHeight };
}

export function ocrInputs(gray: Uint8Array, width: number, height: number, options: PreprocessOptions = DEFAULT_PREPROCESS): OcrInputs {
  const source = options.cropWidth ? cropToScreen(gray, width, height, options.cropWidth) : { gray, width, height };
  const blurred = boxBlur(source.gray, source.width, source.height, options.blurRadius);
  return {
    images: [adaptiveThreshold(blurred, source.width, source.height, options.sensitivity), blurred],
    width: source.width,
    height: source.height,
  };
}
