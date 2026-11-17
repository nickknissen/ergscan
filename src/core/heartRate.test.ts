import { describe, expect, it } from 'vitest';
import { heartRateZones } from './heartRate';
import { emptyRow, type Workout, type WorkoutRow } from './workout';

function row(durationDs: number | null, heartRate: number | null, isRest = false): WorkoutRow {
  return { ...emptyRow(), durationDs, heartRate, isRest };
}

function workout(summary: WorkoutRow, rows: WorkoutRow[] = []): Workout {
  return { startTime: new Date(2026, 0, 1), splitDistance: 500, summary, rows };
}

describe('heartRateZones', () => {
  it('puts a workout without splits in the zone of its average HR', () => {
    expect(heartRateZones(workout(row(12000, 150)), 200)).toEqual([0, 0, 12000, 0, 0]);
  });

  it('starts each zone at its lower percent, with everything under 60 percent in zone 1', () => {
    const splits = [row(10, 90), row(20, 119), row(40, 120), row(80, 180), row(160, 210)];
    expect(heartRateZones(workout(row(310, 150), splits), 200)).toEqual([30, 40, 0, 0, 240]);
  });

  it('is all zero when the workout has no HR', () => {
    expect(heartRateZones(workout(row(4800, null), [row(1200, null)]), 200)).toEqual([0, 0, 0, 0, 0]);
  });

  it('adds each split time to the zone of its HR and skips rest', () => {
    const splits = [row(1200, 130), row(1200, 165), row(600, 120, true), row(1200, 170), row(1200, 185)];
    expect(heartRateZones(workout(row(4800, 162), splits), 200)).toEqual([0, 1200, 0, 2400, 1200]);
  });
});
