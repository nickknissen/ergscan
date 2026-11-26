import { asFeeling } from './feeling';
import { emptyRow, isBlank, type ExtraColumn, type Workout, type WorkoutRow } from './workout';

export interface HistoryEntry {
  id: string;
  workout: Workout;
  extraColumn: ExtraColumn | null;
}

export type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const HISTORY_KEY = 'ergscan.history';

export function loadHistory(storage: Pick<Storage, 'getItem'>): HistoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item: unknown) => parseEntry(item) ?? []);
}

export function parseEntry(item: unknown): HistoryEntry | null {
  const entry = item as {
    id?: unknown;
    workout?: Omit<Partial<Workout>, 'startTime'> & { startTime?: unknown };
    extraColumn?: unknown;
  };
  const workout = entry?.workout;
  if (typeof entry?.id !== 'string' || !workout || !Array.isArray(workout.rows)) return null;
  const rows = workout.rows;
  const value = workout.startTime;
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  const startTime = new Date(value);
  if (Number.isNaN(startTime.getTime())) return null;
  return {
    id: entry.id,
    workout: {
      startTime,
      splitDistance: workout.splitDistance === 1000 ? 1000 : 500,
      summary: parseRow(workout.summary),
      rows: rows.map(parseRow),
      dragFactor: typeof workout.dragFactor === 'number' ? workout.dragFactor : null,
      name: typeof workout.name === 'string' ? workout.name : null,
      notes: typeof workout.notes === 'string' ? workout.notes : null,
      feeling: asFeeling(workout.feeling),
      heartRates: parseHeartRates(workout.heartRates),
    },
    extraColumn: entry.extraColumn === 'heartRate' || entry.extraColumn === 'watts' || entry.extraColumn === 'calories' ? entry.extraColumn : null,
  };
}

function parseRow(input: Partial<WorkoutRow> | null | undefined): WorkoutRow {
  const row = emptyRow();
  const fields = ['durationDs', 'distanceM', 'splitDs', 'rate', 'heartRate', 'watts', 'calories'] as const;
  for (const field of fields) {
    const value = input?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) row[field] = value;
  }
  row.isRest = input?.isRest === true;
  return row;
}

function parseHeartRates(value: unknown): (number | null)[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const valid = value.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v)));
  return valid ? (value as (number | null)[]) : null;
}

export function draftKey(workout: Workout, extraColumn: ExtraColumn | null): string {
  const { startTime, splitDistance, summary, rows, dragFactor, name, notes, feeling, heartRates } = workout;
  return JSON.stringify({ workout: { startTime, splitDistance, summary, rows, dragFactor, name, notes, feeling, heartRates }, extraColumn });
}

export function hasUnsavedChanges(workout: Workout, extraColumn: ExtraColumn | null, savedKey: string | null): boolean {
  return savedKey === null ? !isBlank(workout) : draftKey(workout, extraColumn) !== savedKey;
}

/** Sync keeps both versions of a workout edited on two devices, the second as `<id>~<revision>`. */
export function isConflictCopy(id: string): boolean {
  return id.indexOf('~') > 0;
}

/** The id of the workout a conflict copy was made from; an original's own id. */
export function originalId(id: string): string {
  return isConflictCopy(id) ? id.slice(0, id.indexOf('~')) : id;
}
