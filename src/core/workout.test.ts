import { describe, expect, it } from 'vitest';
import { emptyRow, splitFor, sumRows, wattsForSplit, type WorkoutRow } from './workout';

function row(partial: Partial<WorkoutRow>): WorkoutRow {
  return { ...emptyRow(), ...partial };
}

describe('splitFor', () => {
  it('computes /500m pace from duration and distance', () => {
    expect(splitFor(4500, 2000, 500)).toBe(1125);
  });

  it('computes /1000m pace', () => {
    expect(splitFor(4500, 2000, 1000)).toBe(2250);
  });
});

describe('wattsForSplit', () => {
  it('matches the Concept2 pace to watts formula', () => {
    expect(wattsForSplit(1200, 500)).toBe(203);
    expect(wattsForSplit(1000, 500)).toBe(350);
  });

  it('handles /1000m splits', () => {
    expect(wattsForSplit(2400, 1000)).toBe(203);
  });
});

describe('sumRows', () => {
  it('totals active rows and skips rest rows', () => {
    const rows = [
      row({ durationDs: 1200, distanceM: 500, rate: 24, heartRate: 150 }),
      row({ durationDs: 600, distanceM: 30, isRest: true }),
      row({ durationDs: 1200, distanceM: 520, rate: 26, heartRate: 160 }),
    ];
    const total = sumRows(rows, 500);
    expect(total.durationDs).toBe(2400);
    expect(total.distanceM).toBe(1020);
    expect(total.splitDs).toBe(1176);
    expect(total.rate).toBe(25);
    expect(total.heartRate).toBe(155);
    expect(total.watts).toBeNull();
    expect(total.isRest).toBe(false);
  });
});
