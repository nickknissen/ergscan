export function toGrayscale(rgba: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * rgba[o]! + 0.587 * rgba[o + 1]! + 0.114 * rgba[o + 2]!);
  }
  return gray;
}

export function adaptiveThreshold(gray: Uint8Array, width: number, height: number, sensitivity = 0.15): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]!;
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1]! + rowSum;
    }
  }

  const half = Math.max(1, Math.floor(Math.max(width, height) / 16));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const area = (x1 - x0) * (y1 - y0);
      const sum =
        integral[y1 * (width + 1) + x1]! - integral[y0 * (width + 1) + x1]! - integral[y1 * (width + 1) + x0]! + integral[y0 * (width + 1) + x0]!;
      out[y * width + x] = gray[y * width + x]! * area < sum * (1 - sensitivity) ? 0 : 255;
    }
  }
  return out;
}
