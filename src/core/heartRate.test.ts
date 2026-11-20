import { describe, expect, it } from 'vitest';
import { heartRateZones } from './heartRate';
import { emptyRow, type Workout, type WorkoutRow } from './workout';

function row(durationDs: number | null, heartRate: number | null, isRest = false): WorkoutRow {
  return { ...emptyRow(), durationDs, heartRate, isRest };
}

function workout(summary: WorkoutRow, rows: WorkoutRow[] = []): Workout {
  return { startTime: new Date(2026, 0, 1), splitDistance: 500, dragFactor: null, name: null, notes: null, feeling: null, summary, rows, heartRates: null };
}

describe('heartRateZones', () => {
  it('puts a workout without splits in the zone of its average HR', () => {
    expect(heartRateZones(workout(row(12000, 150)), 200)).toEqual([0, 0, 12000, 0, 0, 0]);
  });

  it('splits max HR into the rowing bands UT3, UT2, UT1, AT, TR and AN at 55, 70, 80, 85 and 90 percent', () => {
    const splits = [row(1, 109), row(2, 110), row(4, 140), row(8, 160), row(16, 170), row(32, 180), row(64, 210)];
    expect(heartRateZones(workout(row(127, 150), splits), 200)).toEqual([1, 2, 4, 8, 16, 96]);
  });

  it('keeps a heart rate just under a band boundary in the band below', () => {
    const splits = [row(1, 139), row(2, 159), row(4, 169), row(8, 179)];
    expect(heartRateZones(workout(row(15, 150), splits), 200)).toEqual([0, 1, 2, 4, 8, 0]);
  });

  it('is all zero when the workout has no HR', () => {
    expect(heartRateZones(workout(row(4800, null), [row(1200, null)]), 200)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('counts every second of a watch recording, rest included, instead of split averages', () => {
    const splits = [row(600, 190), row(600, 100, true)];
    const heartRates = [...Array(30).fill(110), ...Array(20).fill(150), null, ...Array(69).fill(185)];
    expect(heartRateZones({ ...workout(row(1200, 150), splits), heartRates }, 200)).toEqual([0, 300, 200, 0, 0, 690]);
  });

  it('adds each split time to the zone of its HR and skips rest', () => {
    const splits = [row(1200, 130), row(1200, 165), row(600, 120, true), row(1200, 170), row(1200, 185)];
    expect(heartRateZones(workout(row(4800, 162), splits), 200)).toEqual([0, 1200, 0, 1200, 1200, 1200]);
  });
});
