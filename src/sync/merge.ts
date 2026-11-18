import { parseEntry, type HistoryEntry } from '../core/history';

export interface RecordVersion {
  id: string;
  revision: string;
  entry: HistoryEntry | null;
}

export interface Change extends RecordVersion {
  base: string | null;
  sequence: number;
}

export interface Snapshot {
  version: 1;
  records: RecordVersion[];
  applied: [device: string, sequence: number][];
}

export function emptySnapshot(): Snapshot {
  return { version: 1, records: [], applied: [] };
}

export function merge(snapshot: Snapshot, device: string, changes: readonly Change[]): Snapshot {
  const records = new Map(snapshot.records.map((record) => [record.id, record]));
  const applied = new Map(snapshot.applied);
  let sequence = applied.get(device) ?? 0;
  for (const change of changes) {
    if (change.sequence <= sequence) continue;
    sequence = change.sequence;
    const { id, revision, entry, base } = change;
    const previous = records.get(id);
    if (previous?.revision === revision || (previous?.entry === null && entry !== null)) continue;
    if (entry === null || !previous || previous.revision === base) {
      records.set(id, { id, revision, entry });
    } else {
      // An editor can save several times before learning its work became a conflict copy.
      const branch = base && Array.from(records.values()).find(
        (record) => record.revision === base && record.id.startsWith(id + '~'),
      );
      const copyId = branch ? branch.id : id + '~' + revision;
      if (branch && !branch.entry) continue;
      records.set(copyId, { id: copyId, revision, entry: { ...entry, id: copyId } });
    }
  }
  if (sequence) applied.set(device, sequence);
  return { version: 1, records: [...records.values()], applied: [...applied] };
}

export function parseSnapshot(input: unknown): Snapshot {
  if (!input || typeof input !== 'object') throw new Error('Invalid snapshot');
  const { version, records, applied } = input as Snapshot;
  if (version !== 1 || !Array.isArray(records) || !Array.isArray(applied)) throw new Error('Invalid snapshot');
  const seen = new Set<string>();
  const parsed = records.map((record) => {
    if (typeof record?.id !== 'string' || typeof record.revision !== 'string' || seen.has(record.id)) {
      throw new Error('Invalid workout revision');
    }
    seen.add(record.id);
    const source = record.entry?.workout;
    const entry = record.entry === null ? null : parseEntry(record.entry);
    if (record.entry !== null && (
      entry?.id !== record.id || !source || ![500, 1000].includes(source.splitDistance) ||
      !validRow(source.summary) || !source.rows.every(validRow) ||
      ![null, 'heartRate', 'watts', 'calories'].includes(record.entry.extraColumn)
    )) {
      throw new Error('Invalid workout');
    }
    return { id: record.id, revision: record.revision, entry };
  });
  const devices = new Set<string>();
  for (const checkpoint of applied) {
    if (!Array.isArray(checkpoint) || typeof checkpoint[0] !== 'string' || devices.has(checkpoint[0]) ||
        !Number.isSafeInteger(checkpoint[1]) || checkpoint[1] < 1) {
      throw new Error('Invalid device checkpoint');
    }
    devices.add(checkpoint[0]);
  }
  return { version, records: parsed, applied };
}

function validRow(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const row = input as Record<string, unknown>;
  return typeof row.isRest === 'boolean' &&
    ['durationDs', 'distanceM', 'splitDs', 'rate', 'heartRate', 'watts', 'calories'].every(
      (key) => row[key] === null || (typeof row[key] === 'number' && Number.isFinite(row[key])),
    );
}
