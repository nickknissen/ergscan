import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from './time';

describe('parseTime', () => {
  it.each([
    ['1:55.3', 1153],
    ['7:30.0', 4500],
    ['30:00.0', 18000],
    ['1:00:00.0', 36000],
    ['1:02:03.4', 37234],
    [':30.0', 300],
    ['2:00', 1200],
    ['0:05.0', 50],
  ])('parses %s to %i deciseconds', (text, ds) => {
    expect(parseTime(text)).toBe(ds);
  });

  it.each(['', 'abc', '1:75.0', '1:60:00.0', '155.3', '1:5'])('rejects %s', (text) => {
    expect(parseTime(text)).toBeNull();
  });
});

describe('formatTime', () => {
  it.each([
    [1153, '1:55.3'],
    [50, '0:05.0'],
    [18000, '30:00.0'],
    [37234, '1:02:03.4'],
  ])('formats %i as %s', (ds, text) => {
    expect(formatTime(ds)).toBe(text);
  });
});
