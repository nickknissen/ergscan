import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { maxBytesFromEnv, openSyncDatabase } from './sync.ts';

const DAY = 24 * 60 * 60_000;

export interface CheckOptions {
  /** The server's total snapshot cap, `ERGSCAN_SYNC_MAX_BYTES`. */
  maxBytes: number;
  /** Share of the cap above which stored snapshots are reported. */
  usedShare?: number;
  /** Vaults created in the last 24 hours above which creation is reported. */
  newVaults?: number;
  now?: number;
}

/**
 * Looks for signs that a sync server's storage is being abused: snapshots filling the cap, a burst of new
 * vaults, or uploads already refused because the server was full. Problems are one line each.
 */
export function checkStorage(
  filename: string, { maxBytes, usedShare = 0.8, newVaults = 10, now = Date.now() }: CheckOptions,
): { problems: string[]; summary: string } {
  const db = openSyncDatabase(filename);
  try {
    const { vaults, bytes } = db.prepare(
      'SELECT count(*) AS vaults, coalesce(sum(snapshot_bytes), 0) AS bytes FROM vaults',
    ).get() as { vaults: number; bytes: number };
    const created = Number(db.prepare('SELECT count(*) AS n FROM vaults WHERE created_at > ?').get(now - DAY)?.n);
    const refused = Number(db.prepare('SELECT count(*) AS n FROM refusals WHERE at > ?').get(now - DAY)?.n);
    const percent = (share: number) => Math.round(share * 100) + '%';
    const used = `${bytes} of ${maxBytes} snapshot bytes`;
    const problems: string[] = [];
    if (bytes > maxBytes * usedShare) {
      problems.push(`Storage: ${used} used (${percent(bytes / maxBytes)}), above the ${percent(usedShare)} warning level`);
    }
    if (created > newVaults) problems.push(`Vaults: ${created} created in the last 24 hours, above ${newVaults}`);
    if (refused > 0) {
      problems.push(`Full: ${refused} snapshot${refused === 1 ? '' : 's'} refused in the last 24 hours because the server was full`);
    }
    const summary = `OK: ${vaults} vault${vaults === 1 ? '' : 's'}, ${used} (${percent(bytes / maxBytes)})`;
    return { problems, summary };
  } finally {
    db.close();
  }
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Exit codes: 0 all clear, 1 a check tripped, 2 the check could not run.
  try {
    const filename = process.env.ERGSCAN_SYNC_DB ?? 'ergscan-sync.sqlite';
    // Opening a missing file would create an empty database and report all clear.
    if (!existsSync(filename)) throw new Error(`No sync database at ${filename}; set ERGSCAN_SYNC_DB`);
    const { problems, summary } = checkStorage(filename, {
      maxBytes: maxBytesFromEnv(),
      usedShare: numberFromEnv('ERGSCAN_SYNC_CHECK_USED_PERCENT', 80) / 100,
      newVaults: numberFromEnv('ERGSCAN_SYNC_CHECK_NEW_VAULTS', 10),
    });
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1;
    else console.log(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
