import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HISTORY_KEY, type HistoryEntry } from '../core/history';
import { emptyRow } from '../core/workout';
import { emptySnapshot, merge } from './merge';
import { historyStore, workouts, type Device } from './store';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('BroadcastChannel', undefined);
});
afterEach(() => vi.unstubAllGlobals());

function workout(id: string): HistoryEntry {
  return {
    id, extraColumn: null,
    workout: {
      startTime: new Date('2026-11-18T10:00:00Z'), splitDistance: 500, rows: [],
      summary: { ...emptyRow(), distanceM: 2000, durationDs: 4500 },
      dragFactor: null, name: null, notes: null, feeling: null, heartRates: null,
    },
  };
}

function legacyStorage(entries: readonly HistoryEntry[]): Storage {
  const data = new Map([[HISTORY_KEY, JSON.stringify(entries)]]);
  return {
    get length() { return data.size; },
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
  };
}

it('migrates history once, preserves every record, and imports saves from an older open tab', async () => {
  const legacy = Array.from({ length: 100 }, (_, i) => workout('legacy-' + i));
  const storage = legacyStorage(legacy);
  const firstTab = historyStore(storage);
  await firstTab.initialize();
  expect(storage.getItem(HISTORY_KEY)).toBeNull();
  expect(workouts(await firstTab.read()).map((entry) => entry.id)).toEqual(legacy.map((entry) => entry.id));
  await firstTab.save(workout('new'), null);

  storage.setItem(HISTORY_KEY, JSON.stringify([workout('from-old-tab')]));
  const reloaded = historyStore(storage);
  await reloaded.initialize();
  await reloaded.initialize();
  const restored = workouts(await reloaded.read());
  expect(restored).toHaveLength(102);
  expect(restored.map((entry) => entry.id)).toContain('legacy-0');
  expect(restored.map((entry) => entry.id)).toContain('from-old-tab');
  expect(restored[0]?.workout.startTime).toBeInstanceOf(Date);
});

it('persists changes across reload and preserves changes made during an upload', async () => {
  const firstTab = historyStore(null);
  await firstTab.initialize();
  const device: Device = { id: 'phone', vault: 'example', token: 'token', key: 'key' };
  await firstTab.attach(device);
  const saved = await firstTab.save(workout('offline'), null);
  const reloaded = historyStore(null);
  await reloaded.initialize();
  const { pending } = await reloaded.read();
  expect(pending.map((change) => change.id)).toEqual(['offline']);
  await firstTab.save(workout('during-upload'), null);
  const remote = merge(emptySnapshot(), device.id, pending);
  await reloaded.accept(device, null, remote, '"1"');
  expect((await reloaded.read()).pending.map((change) => change.id)).toEqual(['during-upload']);

  await firstTab.remove(['offline']);
  const stale = await reloaded.save(workout('offline'), saved!.revision);
  expect(stale).toBeNull();
  expect(workouts(await reloaded.read()).map((entry) => entry.id)).toEqual(['during-upload']);
});
