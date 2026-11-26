import { formatTime } from './time';
import type { Workout, WorkoutRow } from './workout';

/** Without splits to go by, a whole-minute time with an uneven distance reads as a time piece. */
const WHOLE_MINUTE_DS = 600;
const ROUND_DISTANCE_M = 100;

/** A distance piece is measured by its time, a time piece by its metres, intervals by their pace alone. */
export type StructureKind = 'distance' | 'time' | 'intervals';

/** Matched workouts have equal structures: the same `key`, and so the same `kind`. */
export interface Structure {
  kind: StructureKind;
  key: string;
}

interface Shape {
  kind: StructureKind;
  name: string;
  /** False for uneven intervals, such as a pyramid or a misread rest: they get a name but no structure. */
  even: boolean;
}

/** A short name from the workout's structure, like "2000m", "30:00" or "8x500m/3:30r". */
export function suggestName(workout: Workout): string | null {
  return shapeOf(workout)?.name ?? null;
}

/** The workout's structure, which includes the machine by its split distance; null when it has none. */
export function structureOf(workout: Workout): Structure | null {
  const shape = shapeOf(workout);
  return shape?.even ? { kind: shape.kind, key: `${shape.name} /${workout.splitDistance}m` } : null;
}

function shapeOf(workout: Workout): Shape | null {
  const { summary, rows } = workout;
  const work = rows.filter((r) => !r.isRest);
  const rests = rows.filter((r) => r.isRest);
  const intervals = rests.length > 0 && work.length > 1;

  if (intervals) {
    const piece = allSame(work, 'distanceM') ? `${work[0]!.distanceM}m` : allSame(work, 'durationDs') ? clock(work[0]!.durationDs!) : null;
    if (piece) {
      const restDs = allSame(rests, 'durationDs') ? rests[0]!.durationDs : null;
      return { kind: 'intervals', name: `${work.length}x${piece}${restDs ? `/${clock(restDs)}r` : ''}`, even: restDs !== null };
    }
  }

  const even = !intervals;
  const { durationDs: time, distanceM: distance } = summary;
  const timed =
    work.length >= 3
      ? allSame(work.slice(0, -1), 'durationDs') && !allSame(work, 'distanceM')
      : time !== null && time % WHOLE_MINUTE_DS === 0 && (distance === null || distance % ROUND_DISTANCE_M !== 0);
  if (timed && time) return { kind: 'time', name: clock(time), even };
  if (distance) return { kind: 'distance', name: `${distance}m`, even };
  return time ? { kind: 'time', name: clock(time), even } : null;
}

function allSame(rows: WorkoutRow[], key: 'durationDs' | 'distanceM'): boolean {
  const first = rows[0]?.[key];
  return first != null && rows.every((r) => r[key] === first);
}

function clock(ds: number): string {
  const text = formatTime(ds);
  return ds % 10 === 0 ? text.slice(0, -2) : text;
}
