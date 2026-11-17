import { isBlank, type ExtraColumn, type Workout } from './workout';

export interface HistoryEntry {
  id: string;
  workout: Workout;
  extraColumn: ExtraColumn | null;
}

export type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const HISTORY_KEY = 'ergscan.history';
export const HISTORY_LIMIT = 100;

export function loadHistory(storage: HistoryStorage): HistoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item: unknown) => {
    const entry = item as { id?: unknown; workout?: { startTime?: unknown; rows?: unknown }; extraColumn?: ExtraColumn | null };
    if (typeof entry?.id !== 'string' || !entry.workout || !Array.isArray(entry.workout.rows)) return [];
    const startTime = new Date(entry.workout.startTime as string);
    if (Number.isNaN(startTime.getTime())) return [];
    return [{ id: entry.id, workout: { ...(entry.workout as Workout), startTime }, extraColumn: entry.extraColumn ?? null }];
  });
}

export function saveToHistory(storage: HistoryStorage, entry: HistoryEntry): HistoryEntry[] {
  const others = loadHistory(storage).filter((e) => e.id !== entry.id);
  const entries = [entry, ...others]
    .sort((a, b) => b.workout.startTime.getTime() - a.workout.startTime.getTime())
    .slice(0, HISTORY_LIMIT);
  return write(storage, entries);
}

export function draftKey(workout: Workout, extraColumn: ExtraColumn | null): string {
  return JSON.stringify({ workout, extraColumn });
}

export function hasUnsavedChanges(workout: Workout, extraColumn: ExtraColumn | null, savedKey: string | null): boolean {
  return savedKey === null ? !isBlank(workout) : draftKey(workout, extraColumn) !== savedKey;
}

export function removeFromHistory(storage: HistoryStorage, id: string): HistoryEntry[] {
  return write(storage, loadHistory(storage).filter((e) => e.id !== id));
}

function write(storage: HistoryStorage, entries: HistoryEntry[]): HistoryEntry[] {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    return loadHistory(storage);
  }
  return entries;
}
