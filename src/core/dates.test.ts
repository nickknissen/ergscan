import { describe, expect, it } from 'vitest';
import { fitFileName, fromLocalInput, startTimeFor, toLocalInput } from './dates';

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

describe('startTimeFor', () => {
  const photo = new Date(2026, 10, 16, 7, 40);

  it('subtracts the workout length from the photo time when the screen date is the same day', () => {
    expect(startTimeFor({ year: 2026, month: 11, day: 16 }, photo, 18000)).toEqual(new Date(2026, 10, 16, 7, 10));
  });

  it('uses noon on the screen date for an older workout', () => {
    expect(startTimeFor({ year: 2026, month: 10, day: 6 }, photo, 18000)).toEqual(new Date(2026, 9, 6, 12, 0));
  });

  it('falls back to the photo time when the date was not read', () => {
    expect(startTimeFor(null, photo, 600)).toEqual(new Date(2026, 10, 16, 7, 39));
  });
});

describe('fitFileName', () => {
  it('names the file after the local start time', () => {
    expect(fitFileName(new Date(2026, 10, 16, 7, 5))).toBe('ergscan-20261116-0705.fit');
  });
});
