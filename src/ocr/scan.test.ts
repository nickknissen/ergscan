import { describe, expect, it, vi } from 'vitest';
import { firstParsed } from './scan';

vi.mock('./tesseract', () => ({ recognizeText: vi.fn() }));

const SPLITS = 'time meter /500m s/m\n4:00.0 1000 2:00.0 24\n2:00.0 500 2:00.0 24\n2:00.0 500 2:00.0 24';
const SUMMARY_ONLY = 'time meter /500m s/m\n4:00.0 1000 2:00.0 24';

describe('firstParsed', () => {
  it('stops at the first attempt that yields split rows', async () => {
    const second = vi.fn(async () => SPLITS);
    const outcome = await firstParsed([async () => SPLITS, second]);
    expect(outcome.scan!.rows).toHaveLength(2);
    expect(second).not.toHaveBeenCalled();
  });

  it('falls back to the next attempt when the first cannot be parsed', async () => {
    const outcome = await firstParsed([async () => 'garbage', async () => SPLITS]);
    expect(outcome.text).toBe(SPLITS);
    expect(outcome.scan!.summaryFromScreen).toBe(true);
  });

  it('keeps the richer result when no attempt has split rows', async () => {
    const outcome = await firstParsed([async () => SUMMARY_ONLY, async () => 'noise']);
    expect(outcome.scan!.summary.distanceM).toBe(1000);
  });

  it('returns the longest raw text when nothing parses', async () => {
    const outcome = await firstParsed([async () => 'ab', async () => 'abcdef']);
    expect(outcome).toEqual({ scan: null, text: 'abcdef' });
  });
});
