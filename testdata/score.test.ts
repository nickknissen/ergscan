import { describe, expect, it } from 'vitest';
import { emptyRow, type WorkoutRow } from '../src/core/workout';
import type { Facts } from './facts';
import { scoreOcr, scoreWorkout } from './score';

const facts: Facts = {
  image: 'x.jpeg',
  monitor: 'PM5',
  capture: '',
  screenRect: { x: 0, y: 0, width: 1, height: 1 },
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
    expect(score).toEqual({ cells: 7, cellsTotal: 8, rows: 1, rowsTotal: 2, digitRows: 1 });
  });

  it('counts rows with every digit right when colons, points and spacing are forgiven', () => {
    const screen = [
      ['2:05.2', '500', '2:05.2', '24'],
      [':47.5', '250', '1:35.0', '34'],
      ['2:00.0', '500', '2:00.0', '25'],
    ];
    const score = scoreOcr('2105.2 5002:05,2 24\n147.5 250 1:350 34\n2:00.0 500 2:00.0 26', screen);
    expect(score).toMatchObject({ rows: 0, digitRows: 2 });
  });
});

describe('scoreWorkout', () => {
  it('scores summary and lap fields against the facts', () => {
    const scan = {
      splitDistance: 500 as const,
      dragFactor: null,
      extraColumn: null,
      summaryFromScreen: true,
      summary: row({ durationDs: 2400, distanceM: 1000, rate: 24 }),
      rows: [row({ durationDs: 1200, distanceM: 500, rate: 23 })],
    };
    expect(scoreWorkout(scan, facts.workout)).toEqual({ fields: 6, fieldsTotal: 10, laps: 1, lapsExpected: 2 });
    expect(scoreWorkout({ ...scan, date: { year: 2026, month: 1, day: 1 } }, facts.workout).fields).toBe(7);
  });

  it('scores nothing when the scan failed', () => {
    expect(scoreWorkout(null, facts.workout).fields).toBe(0);
  });
});
