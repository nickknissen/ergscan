import { draftKey, HISTORY_KEY, loadHistory, type HistoryEntry } from '../core/history';
import { emptySnapshot, merge, type Change, type Snapshot } from './merge';

export interface Device {
  vault: string;
  id: string;
  token: string;
  key: string;
}

export interface HistoryState {
  device: Device | null;
  snapshot: Snapshot;
  pending: Change[];
  sequence: number;
  etag: string | null;
  migrated: boolean;
}

export type SavedWorkout = HistoryEntry & { revision: string };

function initialState(): HistoryState {
  return { device: null, snapshot: emptySnapshot(), pending: [], sequence: 0, etag: null, migrated: false };
}

export function workouts(state: HistoryState): SavedWorkout[] {
  const snapshot = state.device ? merge(state.snapshot, state.device.id, state.pending) : state.snapshot;
  return snapshot.records.flatMap(({ entry, revision }) => entry ? [{ ...entry, revision }] : [])
    .sort((a, b) => b.workout.startTime.getTime() - a.workout.startTime.getTime());
}

export function historyStore(storage: Storage | null) {
  let connection: Promise<IDBDatabase> | undefined;
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ergscan-history');
  const listeners = new Set<() => void>();

  function open(): Promise<IDBDatabase> {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ergscan', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('history');
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          connection = undefined;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
    return connection;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  if (channel) channel.onmessage = notify;

  async function transact<T>(mode: 'readonly' | 'readwrite', action: (state: HistoryState) => T): Promise<T> {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('history', mode);
      const store = transaction.objectStore('history');
      const request = store.get('state');
      let value: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const state: HistoryState = request.result ?? initialState();
          value = action(state);
          if (mode === 'readwrite') store.put(state, 'state');
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('History transaction aborted'));
    });
  }

  async function update<T>(action: (state: HistoryState) => T): Promise<T> {
    const result = await transact('readwrite', action);
    notify();
    channel?.postMessage(null);
    return result;
  }

  async function initialize() {
    let legacy: string | null = null;
    try { legacy = storage?.getItem(HISTORY_KEY) ?? null; } catch { /* IndexedDB can still be available. */ }
    const entries = legacy === null ? [] : loadHistory({ getItem: () => legacy });
    await update((state) => {
      if (!state.migrated) {
        state.snapshot.records = [...new Map(entries.map((entry) => [entry.id, entry])).values()].map((entry) => ({
          id: entry.id, revision: crypto.randomUUID(), entry,
        }));
        state.migrated = true;
        return;
      }
      if (!entries.length) return;
      // A tab running an older build can save after another tab migrates.
      const existing = new Map(workouts(state).map((entry) => [entry.id, draftKey(entry.workout, entry.extraColumn)]));
      for (const entry of entries) {
        if (existing.get(entry.id) !== draftKey(entry.workout, entry.extraColumn)) change(state, entry.id, entry, null);
      }
    });
    try {
      if (legacy !== null && storage?.getItem(HISTORY_KEY) === legacy) storage.removeItem(HISTORY_KEY);
    } catch { /* A later migration can compare the retained entries against IndexedDB. */ }
  }

  function change(state: HistoryState, id: string, entry: HistoryEntry | null, base: string | null) {
    if (!state.migrated) throw new Error('History is not initialized');
    const revision = crypto.randomUUID();
    const operation = { id, entry, revision, base, sequence: ++state.sequence };
    if (state.device) {
      state.pending.push(operation);
      const projected = merge(state.snapshot, state.device.id, state.pending);
      return projected.records.find((record) => record.revision === revision)?.id;
    }
    state.snapshot = merge(state.snapshot, 'local', [operation]);
    return state.snapshot.records.find((record) => record.revision === revision)?.id;
  }

  return {
    initialize,
    read: () => transact('readonly', (state) => state),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    save: (entry: HistoryEntry, base: string | null) => update((state) => {
      const id = change(state, entry.id, entry, base);
      return workouts(state).find((workout) => workout.id === id) ?? null;
    }),
    remove: (ids: readonly string[]) => update((state) => {
      for (const id of ids) change(state, id, null, null);
    }),
    attach: (device: Device) => update((state) => {
      if (!state.migrated) throw new Error('History is not initialized');
      if (state.device) throw new Error('This browser is already linked');
      const local = workouts(state);
      state.device = device;
      state.snapshot = emptySnapshot();
      state.etag = null;
      state.sequence = 0;
      state.pending = local.map(({ revision, ...entry }) => ({
        id: entry.id, revision, entry, base: null, sequence: ++state.sequence,
      }));
    }),
    accept: (device: Device, startingEtag: string | null, snapshot: Snapshot, etag: string) => update((state) => {
      if (state.device?.token !== device.token || state.etag !== startingEtag) return;
      const applied = snapshot.applied.find(([id]) => id === device.id)?.[1] ?? 0;
      state.snapshot = snapshot;
      state.etag = etag;
      state.pending = state.pending.filter(({ sequence }) => sequence > applied);
    }),
    detach: (expectedToken?: string) => update((state) => {
      if (expectedToken && state.device?.token !== expectedToken) return;
      const records = workouts(state).map(({ revision, ...entry }) => ({ id: entry.id, revision, entry }));
      Object.assign(state, initialState(), { migrated: true, snapshot: { ...emptySnapshot(), records } });
    }),
    clear: () => update((state) => Object.assign(state, initialState(), { migrated: true })),
  };
}

export type HistoryStore = ReturnType<typeof historyStore>;
