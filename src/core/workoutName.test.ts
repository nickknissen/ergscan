import { describe, expect, it } from 'vitest';
import { emptyRow, type Workout, type WorkoutRow } from './workout';
import { structureOf, suggestName } from './workoutName';

const work = (durationDs: number, distanceM: number): WorkoutRow => ({ ...emptyRow(), durationDs, distanceM });
const rest = (durationDs: number): WorkoutRow => ({ ...emptyRow(), durationDs, isRest: true });

function workout(summary: WorkoutRow, rows: WorkoutRow[] = []): Workout {
  return { startTime: new Date(), splitDistance: 500, dragFactor: null, name: null, notes: null, feeling: null, summary, rows, heartRates: null };
}

describe('suggestName', () => {
  it('names a distance piece by its distance', () => {
    expect(suggestName(workout(work(4500, 2000), [work(1130, 500), work(1125, 500), work(1126, 500), work(1119, 500)]))).toBe('2000m');
  });

  it('names a distance piece with two uneven splits by its distance', () => {
    expect(suggestName(workout(work(4000, 1000), [work(2400, 600), work(1600, 400)]))).toBe('1000m');
  });

  it('names a time piece by its time', () => {
    expect(suggestName(workout(work(18000, 7512), [work(6000, 2480), work(6000, 2500), work(6000, 2532)]))).toBe('30:00');
  });

  it('names distance intervals with their count, distance and rest', () => {
    const rows = Array.from({ length: 8 }, (_, i) => [work(1040 + i, 500), rest(2100)]).flat();
    expect(suggestName(workout(work(8350, 4000), rows))).toBe('8x500m/3:30r');
  });

  it('names time intervals with their count, time and rest', () => {
    const rows = [work(6000, 2500), rest(1200), work(6000, 2490), rest(1200), work(6000, 2470), rest(1200), work(6000, 2510)];
    expect(suggestName(workout(work(24000, 9970), rows))).toBe('4x10:00/2:00r');
  });

  it('names a workout with only a total by its round number', () => {
    expect(suggestName(workout(work(12135, 5000)))).toBe('5000m');
    expect(suggestName(workout(work(18000, 7512)))).toBe('30:00');
  });

  it('suggests nothing for an empty workout', () => {
    expect(suggestName(workout(emptyRow()))).toBeNull();
  });
});

describe('structureOf', () => {
  function expectMatched(a: Workout, b: Workout) {
    expect(structureOf(a)).not.toBeNull();
    expect(structureOf(a)).toEqual(structureOf(b));
  }

  it('matches two distance pieces of the same distance rowed at different speeds', () => {
    const fast = workout(work(4500, 2000), [work(1130, 500), work(1125, 500), work(1126, 500), work(1119, 500)]);
    const slow = workout(work(4800, 2000), [work(1200, 500), work(1200, 500), work(1210, 500), work(1190, 500)]);
    expectMatched(fast, slow);
  });

  it('tells a row from a BikeErg ride of the same distance by its split distance', () => {
    const row = workout(work(24000, 10000));
    const ride = { ...workout(work(18000, 10000)), splitDistance: 1000 as const };
    expect(structureOf(row)).not.toEqual(structureOf(ride));
  });

  it('gives a pyramid no structure, so it never matches a continuous piece of the same total', () => {
    const pyramid = workout(work(4700, 2250), [work(520, 250), rest(600), work(1080, 500), rest(600), work(1650, 750), rest(600), work(1060, 500), rest(600), work(500, 250)]);
    expect(structureOf(pyramid)).toBeNull();
    expect(suggestName(pyramid)).toBe('2250m');
  });

  const distanceIntervals = (count: number, restDs: number, splitDs = 1050) =>
    workout(work(count * splitDs, count * 500), Array.from({ length: count }, (_, i) => [work(splitDs + (i % 3), 500), rest(restDs)]).flat());
  const timeIntervals = (count: number, meters: number) =>
    workout(work(count * 6000, count * meters), Array.from({ length: count }, (_, i) => [work(6000, meters + i * 7), rest(1200)]).flat());

  it('matches a time piece, distance intervals and time intervals with their own kind', () => {
    const thirty = (meters: number) => workout(work(18000, meters), [work(6000, meters / 3 - 10), work(6000, meters / 3), work(6000, meters / 3 + 10)]);
    expectMatched(thirty(7512), thirty(7395));
    expectMatched(distanceIntervals(8, 2100), distanceIntervals(8, 2100, 1090));
    expectMatched(timeIntervals(4, 2500), timeIntervals(4, 2420));
  });

  it('keeps apart intervals with a different rest or a different count', () => {
    expect(structureOf(distanceIntervals(8, 1800))).not.toEqual(structureOf(distanceIntervals(8, 2100)));
    expect(structureOf(distanceIntervals(6, 2100))).not.toEqual(structureOf(distanceIntervals(8, 2100)));
  });

  it('ignores the name you typed', () => {
    const test = (summary: WorkoutRow) => ({ ...workout(summary), name: 'Test' });
    expect(structureOf(test(work(4500, 2000)))).not.toEqual(structureOf(test(work(12135, 5000))));
    expectMatched({ ...workout(work(4500, 2000)), name: '2k test' }, workout(work(4600, 2000)));
  });

  it('guesses the structure of a workout with only a total the way its name is guessed', () => {
    expectMatched(workout(work(18000, 7512)), workout(work(18000, 7433)));
    expect(structureOf(workout(work(18000, 7512)))).not.toEqual(structureOf(workout(work(18000, 7500))));
    expectMatched(workout(work(12135, 5000)), workout(work(12300, 5000)));
  });

  it('gives intervals with uneven rests no structure, such as one rest misread as 3:29', () => {
    const misread = workout(work(4200, 2000), [work(1050, 500), rest(2100), work(1048, 500), rest(2090), work(1052, 500), rest(2100), work(1050, 500)]);
    expect(structureOf(misread)).toBeNull();
  });
});
