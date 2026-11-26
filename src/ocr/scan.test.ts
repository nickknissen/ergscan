import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({ ocrEngine: vi.fn(async (): Promise<'ppocr' | 'tesseract'> => 'ppocr') }));
const ppocr = vi.hoisted(() => ({ scanImagePpocr: vi.fn() }));
const tesseract = vi.hoisted(() => ({ scanImageTesseract: vi.fn(async () => ({ scan: null, text: 'tesseract' })) }));
vi.mock('./engine', () => engine);
vi.mock('./ppocr/scan', () => ppocr);
vi.mock('./scanTesseract', () => tesseract);

const photo = new Blob();

describe('scanImage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reads with PP-OCRv6 when the device runs it', async () => {
    ppocr.scanImagePpocr.mockResolvedValue({ scan: null, text: 'ppocr' });
    const { scanImage } = await import('./scan');
    expect((await scanImage(photo, undefined, true)).text).toBe('ppocr');
    expect(ppocr.scanImagePpocr).toHaveBeenCalledWith(photo, undefined, true);
    expect(tesseract.scanImageTesseract).not.toHaveBeenCalled();
  });

  it('reads with Tesseract where PP-OCRv6 does not run', async () => {
    engine.ocrEngine.mockResolvedValueOnce('tesseract');
    const { scanImage } = await import('./scan');
    expect((await scanImage(photo)).text).toBe('tesseract');
    expect(ppocr.scanImagePpocr).not.toHaveBeenCalled();
  });

  it('falls back to Tesseract when PP-OCRv6 fails, for the rest of the session', async () => {
    ppocr.scanImagePpocr.mockRejectedValue(new Error('PP-OCR worker failed: out of memory'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scanImage } = await import('./scan');
    expect((await scanImage(photo)).text).toBe('tesseract');
    expect((await scanImage(photo)).text).toBe('tesseract');
    expect(ppocr.scanImagePpocr).toHaveBeenCalledTimes(1);
    expect(tesseract.scanImageTesseract).toHaveBeenCalledTimes(2);
  });
});
