import { formatTime } from './time';
import type { Workout, WorkoutRow } from './workout';

/** Without splits to go by, a whole-minute time with an uneven distance reads as a time piece. */
const WHOLE_MINUTE_DS = 600;
const ROUND_DISTANCE_M = 100;

/** A short name from the workout's structure, like "2000m", "30:00" or "8x500m/3:30r". */
export function suggestName(workout: Workout): string | null {
  const { summary, rows } = workout;
  const work = rows.filter((r) => !r.isRest);
  const rests = rows.filter((r) => r.isRest);

  if (rests.length > 0 && work.length > 1) {
    const piece = allSame(work, 'distanceM') ? `${work[0]!.distanceM}m` : allSame(work, 'durationDs') ? clock(work[0]!.durationDs!) : null;
    if (piece) {
      const restDs = allSame(rests, 'durationDs') ? rests[0]!.durationDs : null;
      return `${work.length}x${piece}${restDs ? `/${clock(restDs)}r` : ''}`;
    }
  }

  const { durationDs: time, distanceM: distance } = summary;
  const timed =
    work.length >= 3
      ? allSame(work.slice(0, -1), 'durationDs') && !allSame(work, 'distanceM')
      : time !== null && time % WHOLE_MINUTE_DS === 0 && (distance === null || distance % ROUND_DISTANCE_M !== 0);
  if (timed && time) return clock(time);
  if (distance) return `${distance}m`;
  return time ? clock(time) : null;
}

function allSame(rows: WorkoutRow[], key: 'durationDs' | 'distanceM'): boolean {
  const first = rows[0]?.[key];
  return first != null && rows.every((r) => r[key] === first);
}

function clock(ds: number): string {
  const text = formatTime(ds);
  return ds % 10 === 0 ? text.slice(0, -2) : text;
}
