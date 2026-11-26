import { isConflictCopy, originalId, type HistoryEntry } from './history';
import { splitFor, type Workout } from './workout';
import { structureOf, type Structure } from './workoutName';

/** What a workout of the structure is measured by: the time of a distance piece, the metres of a time piece. */
export type WorkoutResult = { kind: 'time'; ds: number } | { kind: 'distance'; m: number };

export interface MatchedRow {
  /** The history entry's id; null for an open workout that isn't saved yet. */
  id: string | null;
  isOpen: boolean;
  startTime: Date;
  /** Null for intervals, which are measured by their pace alone. */
  result: WorkoutResult | null;
  /** The average pace in tenths of a second per the split distance; for intervals, over the work. */
  paceDs: number | null;
  rate: number | null;
  /** This pace minus the open workout's, so below zero is faster. Null on the open row and without paces. */
  differenceDs: number | null;
  isBest: boolean;
}

export interface MatchedWorkouts {
  structure: Structure;
  /** The open workout and its matched workouts, newest first. */
  rows: MatchedRow[];
  /** The rows to show before all of them are asked for: the open workout, the newest and the best. */
  shown: MatchedRow[];
}

const SHOWN_NEWEST = 5;

/**
 * The saved workouts with the same structure as the open one, which may be unsaved (`openId`
 * null). Null when the open workout has no structure or nothing matches it.
 */
export function matchedWorkouts(open: Workout, openId: string | null, entries: readonly HistoryEntry[]): MatchedWorkouts | null {
  const structure = structureOf(open);
  if (!structure) return null;
  // Conflict copies are versions of one workout, so neither they nor the open workout's original count.
  const openOriginal = openId && originalId(openId);
  const matched = entries.filter(
    (entry) => !isConflictCopy(entry.id) && entry.id !== openOriginal && structureOf(entry.workout)?.key === structure.key,
  );
  if (matched.length === 0) return null;

  const openPace = paceOf(open);
  const rows = [{ id: openId, workout: open, isOpen: true }, ...matched.map(({ id, workout }) => ({ id, workout, isOpen: false }))]
    .sort((a, b) => b.workout.startTime.getTime() - a.workout.startTime.getTime())
    .map(({ id, workout, isOpen }): MatchedRow => {
      const paceDs = paceOf(workout);
      return {
        id,
        isOpen,
        startTime: workout.startTime,
        result: resultOf(workout, structure),
        paceDs,
        rate: workout.summary.rate,
        differenceDs: isOpen || paceDs === null || openPace === null ? null : paceDs - openPace,
        isBest: false,
      };
    });

  let best: MatchedRow | null = null;
  for (const row of rows) {
    if (row.paceDs !== null && (best === null || row.paceDs <= best.paceDs!)) best = row;
  }
  if (best) best.isBest = true;

  const newest = new Set(rows.filter((row) => !row.isOpen).slice(0, SHOWN_NEWEST));
  const shown = rows.filter((row) => row.isOpen || row.isBest || newest.has(row));
  return { structure, rows, shown };
}

function paceOf({ summary, splitDistance }: Workout): number | null {
  if (summary.splitDs !== null) return summary.splitDs;
  return summary.durationDs && summary.distanceM ? splitFor(summary.durationDs, summary.distanceM, splitDistance) : null;
}

function resultOf({ summary }: Workout, { kind }: Structure): WorkoutResult | null {
  if (kind === 'distance' && summary.durationDs !== null) return { kind: 'time', ds: summary.durationDs };
  if (kind === 'time' && summary.distanceM !== null) return { kind: 'distance', m: summary.distanceM };
  return null;
}
