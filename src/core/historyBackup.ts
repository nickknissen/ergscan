import { parseEntry, type HistoryEntry } from './history';

const FORMAT = 'ergscan-history';
const VERSION = 1;
/** Far above any real history (a workout is a few kilobytes), so a wrong file fails fast instead of hanging. */
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

export class BackupError extends Error {}

/** The saved workouts as a file to keep somewhere else and restore with parseHistoryBackup. */
export function historyBackup(entries: readonly HistoryEntry[], exportedAt: Date): string {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    exportedAt: exportedAt.toISOString(),
    workouts: entries.map(({ id, workout, extraColumn }) => ({ id, workout, extraColumn })),
  });
}

export function backupFileName(exportedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `ergscan-history-${exportedAt.getFullYear()}${pad(exportedAt.getMonth() + 1)}${pad(exportedAt.getDate())}.json`;
}

/**
 * The workouts in a file made by historyBackup. Throws BackupError for anything else, or when any
 * workout in it is unreadable, so a damaged file is never half restored.
 */
export function parseHistoryBackup(text: string): HistoryEntry[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError('Not JSON');
  }
  const backup = value as { format?: unknown; version?: unknown; workouts?: unknown } | null;
  if (backup?.format !== FORMAT || backup.version !== VERSION || !Array.isArray(backup.workouts)) {
    throw new BackupError('Not an ErgScan history backup');
  }
  return backup.workouts.map((item: unknown) => {
    const entry = parseEntry(item);
    if (!entry) throw new BackupError('Unreadable workout');
    return entry;
  });
}
