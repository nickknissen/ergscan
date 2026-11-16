import { describe, expect, it } from 'vitest';
import { fitFileName, fromLocalInput, toLocalInput } from './dates';

describe('local datetime input', () => {
  it('round-trips a local date to the input format', () => {
    const date = new Date(2026, 10, 16, 7, 5);
    expect(toLocalInput(date)).toBe('2026-11-16T07:05');
    expect(fromLocalInput('2026-11-16T07:05')).toEqual(date);
  });

  it('rejects malformed input', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('16/11/2026 07:05')).toBeNull();
  });
});

describe('fitFileName', () => {
  it('names the file after the local start time', () => {
    expect(fitFileName(new Date(2026, 10, 16, 7, 5))).toBe('ergscan-20261116-0705.fit');
  });
});
