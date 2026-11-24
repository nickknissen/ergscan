import type { Rect } from '../ocr/crop';

/** Longest side the decoder sees. jsQR is fast enough for a live preview at this size, and a pairing code still reads. */
const MAX_SIDE = 800;

let canvas: HTMLCanvasElement | null = null;

/**
 * Reads a QR code from `rect` of an image, video frame or bitmap, scaled down to at most MAX_SIDE. Returns its text, or
 * null when there is no readable code. jsQR loads on first use, so the main bundle doesn't carry it.
 */
export async function decodeQr(source: CanvasImageSource, rect: Rect): Promise<string | null> {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const { default: jsQR } = await import('jsqr');
  const scale = Math.min(1, MAX_SIDE / Math.max(rect.width, rect.height));
  canvas ??= document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(pixels.data, pixels.width, pixels.height)?.data || null;
}
