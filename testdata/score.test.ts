import { describe, expect, it } from 'vitest';
import { emptyRow, type WorkoutRow } from '../src/core/workout';
import type { Facts } from './facts';
import { scoreOcr, scoreWorkout } from './score';

const facts: Facts = {
  image: 'x.jpeg',
  monitor: 'PM5',
  capture: '',
  screen: { title: '', date: '', header: [], rows: [] },
  workout: {
    type: 'FixedDistanceSplits',
    date: '2026-01-01',
    splitDistance: 500,
    complete: true,
    summary: { time: '4:00.0', meters: 1000, split: '2:00.0', rate: 24 },
    laps: [
      { time: '2:00.0', meters: 500, rate: 24 },
      { time: '1:00.0', rest: true },
    ],
  },
  notes: '',
};

const row = (p: Partial<WorkoutRow>): WorkoutRow => ({ ...emptyRow(), ...p });

describe('scoreOcr', () => {
  it('counts cells as a multiset and rows only when complete on one line', () => {
    const screen = [
      ['2:00.0', '500', '2:00.0', '24'],
      ['2:00.0', '500', '2:00.0', '25'],
    ];
    const score = scoreOcr('| 2:00.0  500 2:00.0 24]\n2:00.0 5OO 2:00.0 25', screen);
    expect(score).toEqual({ cells: 7, cellsTotal: 8, rows: 1, rowsTotal: 2 });
  });
});

describe('scoreWorkout', () => {
  it('scores summary and lap fields against the facts', () => {
    const scan = {
      splitDistance: 500 as const,
      extraColumn: null,
      summaryFromScreen: true,
      summary: row({ durationDs: 2400, distanceM: 1000, rate: 24 }),
      rows: [row({ durationDs: 1200, distanceM: 500, rate: 23 })],
    };
    expect(scoreWorkout(scan, facts)).toEqual({ fields: 6, fieldsTotal: 9, laps: 1, lapsExpected: 2 });
  });

  it('scores nothing when the scan failed', () => {
    expect(scoreWorkout(null, facts).fields).toBe(0);
  });
});
