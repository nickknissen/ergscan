import { describe, expect, it, vi } from 'vitest';
import type { WordBox } from './headerRow';
import { DEFAULT_PREPROCESS } from './preprocess';
import { readPhoto, type Recognizer } from './readPhoto';

const HEADER = 'time meter /500m s/m';
const ADDS_UP = `${HEADER}\n4:00.0 1000 2:00.0 24\n2:00.0 500 2:00.0 24\n2:00.0 500 2:00.0 24`;
const MISREAD = `${HEADER}\n4:00.0 1000 2:00.0 24\n2:00.0 500 2:50.0 24\n2:09.0 500 2:00.0 2`;
const GARBLED = `${HEADER}\n4:00.0 1000 2:30.0 24\n2:09.0 500 2:50.0 2`;

const HEADING_WORDS: WordBox[] = [
  { text: 'time', x0: 100, y0: 100, x1: 140, y1: 110 },
  { text: 'meter', x0: 150, y0: 100, x1: 190, y1: 110 },
  { text: 's/m', x0: 200, y0: 100, x1: 220, y1: 110 },
];

const width = 400;
const height = 300;
const gray = new Uint8Array(width * height).fill(128);

/** A recognizer whose page reads return `texts` in turn. */
function recognizer(texts: string[], words: WordBox[] = HEADING_WORDS) {
  let call = 0;
  return {
    text: vi.fn(async () => texts[Math.min(call++, texts.length - 1)]!),
    words: vi.fn(async () => words),
  } satisfies Recognizer;
}

// Each test preprocesses a real-sized image in plain JavaScript: up to 4 s on a slow machine, more beside the
// PP-OCRv6 test that runs the models.
describe('readPhoto', { timeout: 20_000 }, () => {
  it('keeps the screen read without searching for the heading row when it adds up', async () => {
    const ocr = recognizer([ADDS_UP]);
    const outcome = await readPhoto(gray, width, height, ocr);
    expect(outcome.text).toBe(ADDS_UP);
    expect(ocr.words).not.toHaveBeenCalled();
  });

  it('switches to the heading-row crop when its read checks out better', async () => {
    const ocr = recognizer([MISREAD, ADDS_UP]);
    const outcome = await readPhoto(gray, width, height, ocr);
    expect(ocr.words).toHaveBeenCalledOnce();
    expect(outcome.text).toBe(ADDS_UP);
  });

  it('keeps the screen read when the heading-row crop reads worse', async () => {
    const ocr = recognizer([MISREAD, GARBLED]);
    const outcome = await readPhoto(gray, width, height, ocr);
    expect(outcome.text).toBe(MISREAD);
  });

  it('keeps the screen read when no heading row is found', async () => {
    const ocr = recognizer([MISREAD, ADDS_UP], []);
    const outcome = await readPhoto(gray, width, height, ocr);
    expect(outcome.text).toBe(MISREAD);
    expect(ocr.text).toHaveBeenCalledOnce();
  });

  it('reads a photo taken inside the guide frame once, as framed', async () => {
    const ocr = recognizer([MISREAD, ADDS_UP]);
    await readPhoto(gray, width, height, ocr, { ...DEFAULT_PREPROCESS, detectScreen: false });
    expect(ocr.words).not.toHaveBeenCalled();
  });
});
