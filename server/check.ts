import { existsSync } from 'node:fs';
import { databaseFromEnv, isEntryPoint, maxTotalBytesFromEnv, openSyncDatabase, wholeNumberFromEnv } from './sync.ts';

const DAY = 24 * 60 * 60_000;

export interface CheckOptions {
  /** The server's total snapshot cap, `ERGSCAN_SYNC_MAX_BYTES`. */
  maxBytes: number;
  /** Percent of the cap above which stored snapshots are reported. */
  usedPercent?: number;
  /** Vaults created in the last 24 hours above which creation is reported. */
  newVaults?: number;
  now?: number;
}

/**
 * Looks for signs that a sync server's storage is being abused: snapshots filling the cap, a burst of new
 * vaults, or uploads already refused because the server was full. Problems are one line each.
 */
export function checkStorage(
  filename: string, { maxBytes, usedPercent = 80, newVaults = 10, now = Date.now() }: CheckOptions,
): { problems: string[]; summary: string } {
  // Opening brings an older database up to date, as the server would on its next start.
  const db = openSyncDatabase(filename);
  try {
    const { vaults, bytes } = db.prepare(
      'SELECT count(*) AS vaults, coalesce(sum(snapshot_bytes), 0) AS bytes FROM vaults',
    ).get() as { vaults: number; bytes: number };
    const created = Number(db.prepare('SELECT count(*) AS n FROM vaults WHERE created_at > ?').get(now - DAY)?.n);
    const refused = Number(db.prepare('SELECT count(*) AS n FROM refusals WHERE at > ?').get(now - DAY)?.n);
    const used = `${bytes} of ${maxBytes} snapshot bytes`;
    const percent = Math.round(bytes / maxBytes * 100);
    const problems: string[] = [];
    if (bytes > maxBytes * usedPercent / 100) {
      problems.push(`Storage: ${used} used (${percent}%), above the ${usedPercent}% warning level`);
    }
    if (created > newVaults) problems.push(`Vaults: ${created} created in the last 24 hours, above ${newVaults}`);
    if (refused > 0) {
      problems.push(`Full: ${refused} snapshot${refused === 1 ? '' : 's'} refused in the last 24 hours because the server was full`);
    }
    const summary = `OK: ${vaults} vault${vaults === 1 ? '' : 's'}, ${used} (${percent}%)`;
    return { problems, summary };
  } finally {
    db.close();
  }
}

if (isEntryPoint(import.meta.url)) {
  // Exit codes: 0 all clear, 1 a check tripped, 2 the check could not run.
  try {
    const filename = databaseFromEnv();
    // Opening a missing file would create an empty database and report all clear.
    if (!existsSync(filename)) throw new Error(`No sync database at ${filename}; set ERGSCAN_SYNC_DB`);
    const { problems, summary } = checkStorage(filename, {
      maxBytes: maxTotalBytesFromEnv(),
      usedPercent: wholeNumberFromEnv('ERGSCAN_SYNC_CHECK_USED_PERCENT', 80, 1),
      newVaults: wholeNumberFromEnv('ERGSCAN_SYNC_CHECK_NEW_VAULTS', 10, 0),
    });
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1;
    else console.log(summary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
