import { describe, expect, it } from 'vitest';
import { emptyRow, type Workout, type WorkoutRow } from './workout';
import { suggestName } from './workoutName';

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
