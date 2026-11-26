import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadFacts, TESTDATA_DIR } from '../../../testdata/facts';
import { scoreWorkout } from '../../../testdata/score';
import { parsePm5Text } from '../../core/pm5Parser';
import type { Point, Quad } from './geometry';
import models from './models.json';
import { ctcDecode, detBoxes, detInput, ortSessions, PPOCR_LONG_SIDE, PPOCR_SETTINGS, readRgba, sortBoxes, toLines } from './pipeline';

const solid = (width: number, height: number, [r, g, b]: number[]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r!, g!, b!, 255], i);
  return { data, width, height };
};

describe('detInput', () => {
  it('scales the short side up to 736 and both sides to multiples of 32', () => {
    expect(detInput(solid(400, 300, [0, 0, 0]), PPOCR_SETTINGS)).toMatchObject({ width: 992, height: 736 });
    expect(detInput(solid(1000, 750, [0, 0, 0]), PPOCR_SETTINGS)).toMatchObject({ width: 992, height: 736 });
  });

  it('writes blue, green and red planes scaled to −1…1', () => {
    const { tensor, width, height } = detInput(solid(800, 800, [255, 0, 0]), PPOCR_SETTINGS);
    const plane = width * height;
    expect([tensor[0], tensor[plane], tensor[2 * plane]]).toEqual([-1, -1, 1]);
  });
});

describe('detBoxes', () => {
  it('turns a blob of text probability into a box in the source photo, grown around the text', () => {
    const [width, height] = [64, 32];
    const prob = new Float32Array(width * height);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 50; x++) prob[y * width + x] = 0.9;
    const boxes = detBoxes(prob, width, height, 128, 64, PPOCR_SETTINGS);
    expect(boxes).toHaveLength(1);
    const [tl, , br] = boxes[0]!;
    expect(tl[0]).toBeLessThan(20);
    expect(tl[1]).toBeLessThan(20);
    expect(br[0]).toBeGreaterThan(100);
    expect(br[1]).toBeGreaterThan(40);
  });

  it('drops blobs the detector is unsure of', () => {
    const prob = new Float32Array(64 * 32);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 50; x++) prob[y * 64 + x] = 0.4;
    expect(detBoxes(prob, 64, 32, 64, 32, PPOCR_SETTINGS)).toEqual([]);
  });
});

describe('ctcDecode', () => {
  // Class 0 is the blank, then the dictionary, then a space.
  const output = (steps: number[], dictSize: number) => {
    const classes = dictSize + 2;
    const data = new Float32Array(steps.length * classes);
    steps.forEach((c, t) => (data[t * classes + c] = 0.8));
    return { data, dims: [1, steps.length, classes] };
  };

  it('collapses repeats, drops blanks and keeps a letter repeated across a blank', () => {
    const [result] = ctcDecode(output([0, 1, 1, 0, 1, 2, 3, 2], 2), ['a', 'b']);
    expect(result!.text).toBe('aab b');
    expect(result!.score).toBeCloseTo(0.8);
  });

  it('refuses a dictionary that does not match the model', () => {
    expect(() => ctcDecode(output([1], 3), ['a', 'b'])).toThrow(/classes/);
  });
});

/** A word's box: `w × 20` at (x, y), turned by `angle` about the origin. */
function word(text: string, x: number, y: number, angle = 0, w = 60): { text: string; quad: Quad } {
  const turn = ([px, py]: Point): Point => [px * Math.cos(angle) - py * Math.sin(angle), px * Math.sin(angle) + py * Math.cos(angle)];
  return { text, quad: [turn([x, y]), turn([x + w, y]), turn([x + w, y + 20]), turn([x, y + 20])] };
}

describe('sortBoxes', () => {
  it('reads boxes within 10 px of each other as one line, left to right', () => {
    const sorted = sortBoxes([word('c', 200, 104), word('a', 0, 100), word('d', 0, 140), word('b', 100, 98)]);
    expect(sorted.map((w) => w.text)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('toLines', () => {
  it('groups the words of a tilted photo into its rows', () => {
    const angle = (8 * Math.PI) / 180;
    const words = ['a', 'b', 'c'].flatMap((t, i) => [word(t, i * 100, 100, angle), word(t.toUpperCase(), i * 100, 140, angle)]);
    expect(toLines(words)).toBe('a b c\nA B C');
  });

  it('returns nothing for no words', () => {
    expect(toLines([])).toBe('');
  });
});

const dir = join(import.meta.dirname, '../../../public/ppocr');
const haveModels = existsSync(join(dir, models.det.name)) && existsSync(join(dir, models.rec.name));

describe.skipIf(!haveModels)('readRgba with the real models (after `npm run ocr-assets`)', () => {
  it('reads a PM4 photo into the right workout', { timeout: 60_000 }, async () => {
    const ort = await import('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    const sessions = await ortSessions(ort, readFileSync(join(dir, models.det.name)), readFileSync(join(dir, models.rec.name)));
    const dict = JSON.parse(readFileSync(join(dir, models.dict.name), 'utf8')) as string[];
    const { facts } = loadFacts().find((f) => f.name === 'pm4-just-row-40min')!;
    const { data, info } = await sharp(join(TESTDATA_DIR, facts.image))
      .rotate()
      .resize({ width: PPOCR_LONG_SIDE, height: PPOCR_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { text } = await readRgba({ data, width: info.width, height: info.height }, sessions, dict);
    const score = scoreWorkout(parsePm5Text(text), facts.workout);
    expect(score.fields).toBe(score.fieldsTotal);
  });
});
