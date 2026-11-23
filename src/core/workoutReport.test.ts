import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from './history';
import { emptyRow, type Workout, type WorkoutRow } from './workout';
import { listWorkouts, localIso, workoutDetail, workoutSummary } from './workoutReport';

const row = (fields: Partial<WorkoutRow>): WorkoutRow => ({ ...emptyRow(), ...fields });

function entry(id: string, fields: Partial<Workout>): HistoryEntry {
  const workout: Workout = {
    startTime: new Date('2026-11-20T17:00:00Z'), splitDistance: 500, dragFactor: null, name: null, notes: null,
    feeling: null, summary: row({ durationDs: 12000, distanceM: 5000 }), rows: [], heartRates: null, ...fields,
  };
  return { id, workout, extraColumn: null };
}

describe('localIso', () => {
  it('gives the wall clock time with its offset, across daylight saving time', () => {
    expect(localIso(new Date('2026-11-20T17:05:12Z'), 'Europe/Copenhagen')).toBe('2026-11-20T18:05:12+01:00');
    expect(localIso(new Date('2026-07-01T22:30:00Z'), 'Europe/Copenhagen')).toBe('2026-07-02T00:30:00+02:00');
    expect(localIso(new Date('2026-07-01T22:30:00Z'), 'America/St_Johns')).toBe('2026-07-01T20:00:00-02:30');
  });
});

describe('workoutSummary', () => {
  it('reports totals with units, pace per 500 m and watts from the pace when the monitor showed none', () => {
    const report = workoutSummary(entry('a', { summary: row({ durationDs: 12000, distanceM: 5000, rate: 22 }) }), 'UTC');
    expect(report).toEqual({
      id: 'a', start: '2026-11-20T17:00:00+00:00', structure: '5000m', intervals: false,
      timeSec: 1200, time: '20:00.0', distanceM: 5000, paceSecPer500: 120, pacePer500: '2:00.0', watts: 203,
      strokeRate: 22, watchHeartRate: false,
    });
  });

  it('converts a monitor set to 1000 m splits to pace per 500 m', () => {
    const report = workoutSummary(entry('a', { splitDistance: 1000, summary: row({ durationDs: 12000, distanceM: 5000, splitDs: 2401 }) }), 'UTC');
    expect(report).toMatchObject({ paceSecPer500: 120.1, pacePer500: '2:00.1' });
  });

  it('includes the name, feeling, notes and drag factor, and marks a conflict copy', () => {
    const report = workoutSummary(entry('a~r2', { name: 'Steady', feeling: 4, notes: 'Legs heavy', dragFactor: 118 }), 'UTC');
    expect(report).toMatchObject({ name: 'Steady', feeling: 4, notes: 'Legs heavy', dragFactor: 118, conflictCopyOf: 'a' });
  });
});

describe('workoutDetail', () => {
  const intervals = entry('b', {
    summary: row({ durationDs: 2400, distanceM: 1000, heartRate: 150 }),
    rows: [
      row({ durationDs: 1200, distanceM: 500, splitDs: 1200, rate: 28, watts: 203 }),
      row({ durationDs: 600, distanceM: 40, isRest: true }),
      row({ durationDs: 1200, distanceM: 500, splitDs: 1200, rate: 29, watts: 203 }),
    ],
    heartRates: [...Array(120).fill(140), ...Array(60).fill(null), 150, ...Array(119).fill(170)],
  });

  it('lists every split and rest with the highest heart rate in each', () => {
    const report = workoutDetail(intervals, 'UTC');
    expect(report).toMatchObject({ structure: '2x500m/1:00r', intervals: true, heartRateMax: 170, watchHeartRate: true, splitDistanceM: 500 });
    expect(report.splits).toEqual([
      { number: 1, rest: false, timeSec: 120, time: '2:00.0', distanceM: 500, paceSecPer500: 120, pacePer500: '2:00.0', watts: 203, strokeRate: 28, heartRateMax: 140 },
      { number: 2, rest: true, timeSec: 60, time: '1:00.0', distanceM: 40 },
      { number: 3, rest: false, timeSec: 120, time: '2:00.0', distanceM: 500, paceSecPer500: 120, pacePer500: '2:00.0', watts: 203, strokeRate: 29, heartRateMax: 170 },
    ]);
    expect(report.heartRateTrace).toBeUndefined();
  });

  it('averages the watch heart rate over windows when asked', () => {
    expect(workoutDetail(intervals, 'UTC', 60).heartRateTrace).toEqual({ everySec: 60, bpm: [140, 140, null, 170, 170] });
  });

  it('has no splits for a workout with only a total', () => {
    expect(workoutDetail(entry('c', {}), 'UTC').splits).toEqual([]);
  });
});

describe('listWorkouts', () => {
  const at = (iso: string) => ({ startTime: new Date(iso) });
  const entries = [
    entry('mon', at('2026-11-16T06:00:00Z')),
    entry('wed-late', at('2026-11-18T23:30:00Z')),
    entry('fri', at('2026-11-20T17:00:00Z')),
  ];

  it('lists newest first, within local days, and counts the matches before the limit', () => {
    const ids = (result: ReturnType<typeof listWorkouts>) => result.workouts.map((w) => w.id);
    expect(ids(listWorkouts(entries, {}, 'UTC'))).toEqual(['fri', 'wed-late', 'mon']);
    // 23:30 UTC on Wednesday is already Thursday in Copenhagen.
    expect(ids(listWorkouts(entries, { since: '2026-11-19' }, 'Europe/Copenhagen'))).toEqual(['fri', 'wed-late']);
    expect(ids(listWorkouts(entries, { since: '2026-11-19' }, 'UTC'))).toEqual(['fri']);
    expect(ids(listWorkouts(entries, { until: '2026-11-18' }, 'UTC'))).toEqual(['wed-late', 'mon']);
    const limited = listWorkouts(entries, { limit: 1 }, 'UTC');
    expect(limited.total).toBe(3);
    expect(ids(limited)).toEqual(['fri']);
  });
});
