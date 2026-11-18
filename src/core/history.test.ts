import { describe, expect, it } from 'vitest';
import {
  draftKey,
  hasUnsavedChanges,
  HISTORY_KEY,
  loadHistory,
  type HistoryEntry,
  type HistoryStorage,
} from './history';
import { emptyRow } from './workout';

function memoryStorage(initial?: string): HistoryStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(initial === undefined ? [] : [[HISTORY_KEY, initial]]);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function entry(id: string, start: string): HistoryEntry {
  return {
    id,
    workout: { startTime: new Date(start), splitDistance: 500, dragFactor: null, name: null, notes: null, feeling: null, summary: { ...emptyRow(), durationDs: 4500, distanceM: 2000 }, rows: [] },
    extraColumn: 'watts',
  };
}

describe('history', () => {
  it('round-trips entries and restores the start time as a Date', () => {
    const storage = memoryStorage();
    storage.setItem(HISTORY_KEY, JSON.stringify([entry('a', '2026-11-16T07:00:00Z')]));
    const [loaded] = loadHistory(storage);
    expect(loaded!.workout.startTime).toBeInstanceOf(Date);
    expect(loaded).toEqual(entry('a', '2026-11-16T07:00:00Z'));
  });

  it('keeps the drag factor with the workout', () => {
    const storage = memoryStorage();
    const withDrag = entry('a', '2026-11-16T07:00:00Z');
    withDrag.workout.dragFactor = 125;
    storage.setItem(HISTORY_KEY, JSON.stringify([withDrag]));
    expect(loadHistory(storage)[0]!.workout.dragFactor).toBe(125);
  });

  it('keeps the name and notes with the workout', () => {
    const storage = memoryStorage();
    const named = entry('a', '2026-11-16T07:00:00Z');
    named.workout.name = 'Test day';
    named.workout.notes = 'Felt strong';
    storage.setItem(HISTORY_KEY, JSON.stringify([named]));
    expect(loadHistory(storage)[0]!.workout).toMatchObject({ name: 'Test day', notes: 'Felt strong' });
  });

  it('keeps how the workout felt', () => {
    const storage = memoryStorage();
    const rated = entry('a', '2026-11-16T07:00:00Z');
    rated.workout.feeling = 4;
    storage.setItem(HISTORY_KEY, JSON.stringify([rated]));
    expect(loadHistory(storage)[0]!.workout.feeling).toBe(4);
  });

  it('loads a feeling outside the five steps as unrated', () => {
    const stored = (feeling: unknown) =>
      JSON.stringify([{ id: 'a', workout: { startTime: '2026-11-16T07:00:00Z', splitDistance: 500, summary: {}, rows: [], feeling }, extraColumn: null }]);
    for (const bad of [0, 6, 2.5, '3', null]) expect(loadHistory(memoryStorage(stored(bad)))[0]!.workout.feeling, String(bad)).toBeNull();
  });

  it('loads workouts saved before the drag factor, name, notes and feeling existed without them', () => {
    const old = '[{"id":"a","workout":{"startTime":"2026-11-16T07:00:00Z","splitDistance":500,"summary":{},"rows":[]},"extraColumn":null}]';
    expect(loadHistory(memoryStorage(old))[0]!.workout).toMatchObject({ dragFactor: null, name: null, notes: null, feeling: null });
  });

  it('ignores corrupt or malformed storage', () => {
    expect(loadHistory(memoryStorage('not json'))).toEqual([]);
    expect(loadHistory(memoryStorage('{}'))).toEqual([]);
    expect(loadHistory(memoryStorage('[{"id":1},{"id":"x","workout":{"startTime":"nope","rows":[]}}]'))).toEqual([]);
  });
});

describe('hasUnsavedChanges', () => {
  it('treats a new workout as unsaved once it has any data', () => {
    const scanned = entry('a', '2026-11-16T07:00:00Z');
    expect(hasUnsavedChanges(scanned.workout, null, null)).toBe(true);
    const blank = { ...scanned.workout, summary: emptyRow(), rows: [] };
    expect(hasUnsavedChanges(blank, null, null)).toBe(false);
  });

  it('compares a saved workout against what was stored', () => {
    const saved = entry('a', '2026-11-16T07:00:00Z');
    const key = draftKey(saved.workout, saved.extraColumn);
    expect(hasUnsavedChanges(saved.workout, saved.extraColumn, key)).toBe(false);
    expect(hasUnsavedChanges(saved.workout, 'heartRate', key)).toBe(true);
    saved.workout.summary.distanceM = 2100;
    expect(hasUnsavedChanges(saved.workout, saved.extraColumn, key)).toBe(true);
  });
});
