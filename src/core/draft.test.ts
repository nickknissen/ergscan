import { describe, expect, it } from 'vitest';
import { clearDraft, DRAFT_KEY, loadDraft, saveDraft, type Draft, type DraftStorage } from './draft';
import { emptyRow } from './workout';

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 'a',
    workout: { startTime: new Date('2026-11-16T07:00:00Z'), splitDistance: 500, dragFactor: null, summary: { ...emptyRow(), distanceM: 2000 }, rows: [] },
    extraColumn: 'watts',
    savedKey: null,
    origin: 'capture',
    rawText: 'raw',
    notice: '',
    computedSummary: true,
    ...overrides,
  };
}

describe('draft', () => {
  it('round-trips a new workout and restores the start time as a Date', () => {
    const storage = memoryStorage();
    saveDraft(storage, draft());
    const loaded = loadDraft(storage, null);
    expect(loaded!.workout.startTime).toBeInstanceOf(Date);
    expect(loaded).toEqual(draft());
  });

  it('restores a saved workout only for its own id', () => {
    const storage = memoryStorage();
    saveDraft(storage, draft({ savedKey: 'key', origin: 'history' }));
    expect(loadDraft(storage, 'a')).toEqual(draft({ savedKey: 'key', origin: 'history' }));
    expect(loadDraft(storage, 'b')).toBeNull();
    expect(loadDraft(storage, null)).toBeNull();
  });

  it('does not restore a new workout under a saved id', () => {
    const storage = memoryStorage();
    saveDraft(storage, draft());
    expect(loadDraft(storage, 'a')).toBeNull();
  });

  it('returns null for missing, corrupt or invalid drafts', () => {
    const storage = memoryStorage();
    expect(loadDraft(storage, null)).toBeNull();
    storage.data.set(DRAFT_KEY, '{oops');
    expect(loadDraft(storage, null)).toBeNull();
    storage.data.set(DRAFT_KEY, JSON.stringify({ id: 'a', workout: { startTime: 'nope', rows: [] } }));
    expect(loadDraft(storage, null)).toBeNull();
  });

  it('clears the draft', () => {
    const storage = memoryStorage();
    saveDraft(storage, draft());
    clearDraft(storage);
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
  });

  it('drops the draft when storage is full', () => {
    const storage = memoryStorage();
    storage.data.set(DRAFT_KEY, 'stale');
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    saveDraft(storage, draft());
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
  });
});
