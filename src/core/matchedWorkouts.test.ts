import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from './history';
import { matchedWorkouts } from './matchedWorkouts';
import { emptyRow, type Workout, type WorkoutRow } from './workout';

const day = (d: number) => new Date(2026, 9, d, 18);

function piece(startTime: Date, durationDs: number, distanceM: number, rate: number | null = null): Workout {
  const summary: WorkoutRow = { ...emptyRow(), durationDs, distanceM, rate };
  return { startTime, splitDistance: 500, dragFactor: null, name: null, notes: null, feeling: null, summary, rows: [], heartRates: null };
}

const entry = (id: string, workout: Workout): HistoryEntry => ({ id, workout, extraColumn: null });

describe('matchedWorkouts', () => {
  it('lists the open workout and an earlier one with the same structure, with how their paces differ', () => {
    const open = piece(day(20), 4500, 2000, 30);
    const earlier = entry('a', piece(day(3), 4560, 2000, 28));

    expect(matchedWorkouts(open, 'open', [entry('open', open), earlier])?.rows).toEqual([
      { id: 'open', isOpen: true, startTime: day(20), result: { kind: 'time', ds: 4500 }, paceDs: 1125, rate: 30, differenceDs: null, isBest: true },
      { id: 'a', isOpen: false, startTime: day(3), result: { kind: 'time', ds: 4560 }, paceDs: 1140, rate: 28, differenceDs: 15, isBest: false },
    ]);
  });

  it('compares BikeErg rides by their pace per 1000 m, faster below zero and the same pace at zero', () => {
    const ride = (d: number, durationDs: number): Workout => ({ ...piece(day(d), durationDs, 10000), splitDistance: 1000 });
    const open = ride(20, 18000);
    const rows = matchedWorkouts(open, null, [entry('a', ride(10, 17700)), entry('b', ride(5, 18000))])!.rows;
    expect(rows.map(({ paceDs, differenceDs }) => [paceDs, differenceDs])).toEqual([[1800, null], [1770, -30], [1800, 0]]);
  });

  it('marks the fastest pace best, never a workout without a pace', () => {
    const open = piece(day(20), 4500, 2000);
    const noTime: Workout = { ...piece(day(12), 0, 2000), summary: { ...emptyRow(), distanceM: 2000 } };
    const rows = matchedWorkouts(open, 'open', [entry('a', noTime), entry('b', piece(day(4), 4400, 2000))])!.rows;
    expect(rows.map(({ id, paceDs, differenceDs, isBest }) => ({ id, paceDs, differenceDs, isBest }))).toEqual([
      { id: 'open', paceDs: 1125, differenceDs: null, isBest: false },
      { id: 'a', paceDs: null, differenceDs: null, isBest: false },
      { id: 'b', paceDs: 1100, differenceDs: -25, isBest: true },
    ]);
  });

  it('shows the open workout, the 5 newest matched workouts and the best before you ask for all', () => {
    const history = [19, 18, 17, 16, 15, 14, 3].map((d) => entry(`d${d}`, piece(day(d), 4500 + d, 2000)));
    history.push(entry('d2', piece(day(2), 4300, 2000)));
    const shownIds = (open: Workout) => matchedWorkouts(open, null, history)!.shown.map((row) => row.id ?? 'open');

    expect(shownIds(piece(day(20), 4600, 2000))).toEqual(['open', 'd19', 'd18', 'd17', 'd16', 'd15', 'd2']);
    expect(shownIds(piece(day(1), 4600, 2000))).toEqual(['d19', 'd18', 'd17', 'd16', 'd15', 'd2', 'open']);
    expect(matchedWorkouts(piece(day(20), 4600, 2000), null, history.slice(0, 3))!.shown).toHaveLength(4);
  });

  it('measures a time piece by its metres and intervals by their pace alone', () => {
    const thirty = (d: number, distanceM: number) => piece(day(d), 18000, distanceM);
    expect(matchedWorkouts(thirty(20, 7512), null, [entry('a', thirty(3, 7433))])!.rows.map((row) => row.result)).toEqual([
      { kind: 'distance', m: 7512 },
      { kind: 'distance', m: 7433 },
    ]);

    const work = (durationDs: number): WorkoutRow => ({ ...emptyRow(), durationDs, distanceM: 500 });
    const rest: WorkoutRow = { ...emptyRow(), durationDs: 1200, isRest: true };
    const fourBy500 = (d: number, splitDs: number): Workout => ({
      ...piece(day(d), 4 * splitDs, 2000),
      summary: { ...emptyRow(), durationDs: 4 * splitDs, distanceM: 2000, splitDs },
      rows: [work(splitDs), rest, work(splitDs), rest, work(splitDs), rest, work(splitDs)],
    });
    const rows = matchedWorkouts(fourBy500(20, 1050), null, [entry('a', fourBy500(3, 1062))])!.rows;
    expect(rows.map(({ result, paceDs, differenceDs }) => ({ result, paceDs, differenceDs }))).toEqual([
      { result: null, paceDs: 1050, differenceDs: null },
      { result: null, paceDs: 1062, differenceDs: 12 },
    ]);
  });

  it('has nothing to show without a structure or without another workout of it', () => {
    const open = piece(day(20), 4500, 2000);
    expect(matchedWorkouts(open, 'open', [entry('open', open), entry('a', piece(day(3), 12000, 5000))])).toBeNull();

    const rest: WorkoutRow = { ...emptyRow(), durationDs: 600, isRest: true };
    const pyramid = (d: number): Workout => ({
      ...piece(day(d), 3000, 1250),
      rows: [{ ...emptyRow(), durationDs: 500, distanceM: 250 }, rest, { ...emptyRow(), durationDs: 1500, distanceM: 750 }, rest, { ...emptyRow(), durationDs: 1000, distanceM: 250 }],
    });
    expect(matchedWorkouts(pyramid(20), null, [entry('a', pyramid(3))])).toBeNull();
  });

  it('never counts a sync conflict copy, which is another version of the same workout', () => {
    const open = piece(day(20), 4500, 2000);
    const history = [entry('open', open), entry('open~phone', open), entry('a', piece(day(3), 4560, 2000)), entry('a~phone', piece(day(3), 4570, 2000))];
    expect(matchedWorkouts(open, 'open', history)?.rows.map((row) => row.id)).toEqual(['open', 'a']);

    const copy = history[3]!;
    expect(matchedWorkouts(copy.workout, copy.id, history)?.rows.map((row) => row.id)).toEqual(['open', 'a~phone']);
  });
});
