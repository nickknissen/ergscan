import { describe, expect, it } from 'vitest';
import { findHeaderRow, isHeadingWord, tableRectFromHeader, type WordBox } from './headerRow';

const word = (text: string, x0: number, y0: number, width = 40, height = 20): WordBox => ({ text, x0, y0, x1: x0 + width, y1: y0 + height });

/** A heading row at y=200 with five table rows 40 px apart below it, plus a stray "time" elsewhere. */
function table(): WordBox[] {
  const words = [word('time', 100, 200), word('meter', 170, 200), word('/500m', 240, 200), word('s/m', 310, 200), word('Time', 500, 20)];
  for (let i = 1; i <= 5; i++) words.push(word('2:00.0', 90, 200 + i * 40, 60), word('500', 170, 200 + i * 40), word('2:00.0', 240, 200 + i * 40, 60), word('24', 310, 200 + i * 40, 25));
  return words;
}

describe('isHeadingWord', () => {
  it('accepts column headings across monitors and languages', () => {
    for (const text of ['time', 'Meter', 'meters', '/500m', '/1000m', 's/m', 'cal/hr', 'watts', 'tiempo', 'metros']) expect(isHeadingWord(text)).toBe(true);
  });

  it('rejects numbers and other words', () => {
    for (const text of ['2:00.0', '500', 'View', 'Detail']) expect(isHeadingWord(text)).toBe(false);
  });
});

describe('findHeaderRow', () => {
  it('finds the line with the most heading words and measures the row pitch below it', () => {
    const header = findHeaderRow(table())!;
    expect(header.y0).toBe(200);
    expect(header.x0).toBe(90);
    expect(header.x1).toBe(350);
    expect(header.pitch).toBe(40);
  });

  it('returns null when no line has two different heading words', () => {
    expect(findHeaderRow([word('time', 0, 0), word('2:00.0', 0, 40)])).toBeNull();
  });
});

describe('tableRectFromHeader', () => {
  it('covers the title above the heading and the rows below it, within the image', () => {
    const rect = tableRectFromHeader({ x0: 90, y0: 200, x1: 350, y1: 220, pitch: 40 }, 1000, 500);
    expect(rect.y).toBe(40);
    expect(rect.y + rect.height).toBe(500);
    expect(rect.x).toBeLessThan(90);
    expect(rect.x + rect.width).toBeGreaterThan(350);
  });
});
