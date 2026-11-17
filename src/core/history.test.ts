import { describe, expect, it } from 'vitest';
import {
  draftKey,
  hasUnsavedChanges,
  HISTORY_KEY,
  HISTORY_LIMIT,
  loadHistory,
  removeFromHistory,
  saveToHistory,
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
    workout: { startTime: new Date(start), splitDistance: 500, summary: { ...emptyRow(), durationDs: 4500, distanceM: 2000 }, rows: [] },
    extraColumn: 'watts',
  };
}

describe('history', () => {
  it('round-trips entries and restores the start time as a Date', () => {
    const storage = memoryStorage();
    saveToHistory(storage, entry('a', '2026-11-16T07:00:00Z'));
    const [loaded] = loadHistory(storage);
    expect(loaded!.workout.startTime).toBeInstanceOf(Date);
    expect(loaded).toEqual(entry('a', '2026-11-16T07:00:00Z'));
  });

  it('replaces an entry with the same id instead of duplicating it', () => {
    const storage = memoryStorage();
    saveToHistory(storage, entry('a', '2026-11-16T07:00:00Z'));
    const edited = entry('a', '2026-11-16T07:00:00Z');
    edited.workout.summary.distanceM = 2100;
    const entries = saveToHistory(storage, edited);
    expect(entries).toHaveLength(1);
    expect(loadHistory(storage)[0]!.workout.summary.distanceM).toBe(2100);
  });

  it('lists the newest workout first', () => {
    const storage = memoryStorage();
    saveToHistory(storage, entry('new', '2026-11-16T07:00:00Z'));
    saveToHistory(storage, entry('old', '2026-11-01T07:00:00Z'));
    expect(loadHistory(storage).map((e) => e.id)).toEqual(['new', 'old']);
  });

  it(`keeps at most ${HISTORY_LIMIT} entries, dropping the oldest`, () => {
    const storage = memoryStorage();
    for (let i = 0; i <= HISTORY_LIMIT; i++) saveToHistory(storage, entry(`e${i}`, new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString()));
    const entries = loadHistory(storage);
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries.some((e) => e.id === 'e0')).toBe(false);
  });

  it('removes an entry by id', () => {
    const storage = memoryStorage();
    saveToHistory(storage, entry('a', '2026-11-16T07:00:00Z'));
    saveToHistory(storage, entry('b', '2026-11-15T07:00:00Z'));
    expect(removeFromHistory(storage, 'a').map((e) => e.id)).toEqual(['b']);
    expect(loadHistory(storage).map((e) => e.id)).toEqual(['b']);
  });

  it('ignores corrupt or malformed storage', () => {
    expect(loadHistory(memoryStorage('not json'))).toEqual([]);
    expect(loadHistory(memoryStorage('{}'))).toEqual([]);
    expect(loadHistory(memoryStorage('[{"id":1},{"id":"x","workout":{"startTime":"nope","rows":[]}}]'))).toEqual([]);
  });

  it('keeps the stored history when writing fails', () => {
    const storage = memoryStorage();
    saveToHistory(storage, entry('a', '2026-11-16T07:00:00Z'));
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(saveToHistory(storage, entry('b', '2026-11-17T07:00:00Z')).map((e) => e.id)).toEqual(['a']);
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
