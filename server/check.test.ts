import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomSecret } from '../src/sync/crypto';
import { envelope, syncClient } from './testClient';

const hasSqlite = Boolean(process.getBuiltinModule?.('node:sqlite'));
const { createSyncApp } = hasSqlite ? await import('./sync') : { createSyncApp: null };
const { checkStorage } = hasSqlite ? await import('./check') : { checkStorage: null };

const HOUR = 60 * 60_000;
let directory: string;
let database: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ergscan-check-'));
  database = join(directory, 'sync.sqlite');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

/** A sync server on the test database. */
function server(maxBytes: number) {
  const app = createSyncApp!(database, { maxBytes });
  return { ...syncClient(app), close: () => app.close() };
}

it.skipIf(!hasSqlite)('passes a quiet server and summarises what it stores', async () => {
  const sync = server(1000);
  await sync.upload(await sync.vault(), 'a');
  sync.close();
  const result = checkStorage!(database, { maxBytes: 1000 });
  expect(result.problems).toEqual([]);
  expect(result.summary).toBe('OK: 1 vault, 244 of 1000 snapshot bytes (24%)');
});

it.skipIf(!hasSqlite)('flags stored snapshots above the share of the cap', async () => {
  const sync = server(1000);
  for (const fill of 'abcd') await sync.upload(await sync.vault(), fill);
  sync.close();
  // 976 of 1000 bytes.
  expect(checkStorage!(database, { maxBytes: 1000 }).problems).toEqual([
    'Storage: 976 of 1000 snapshot bytes used (98%), above the 80% warning level',
  ]);
  expect(checkStorage!(database, { maxBytes: 1000, usedPercent: 99 }).problems).toEqual([]);
});

it.skipIf(!hasSqlite)('flags many vaults created in the last 24 hours, but not older ones', async () => {
  const sync = server(1_000_000);
  for (let index = 0; index < 11; index++) await sync.vault();
  sync.close();
  expect(checkStorage!(database, { maxBytes: 1_000_000 }).problems).toEqual([
    'Vaults: 11 created in the last 24 hours, above 10',
  ]);
  expect(checkStorage!(database, { maxBytes: 1_000_000, newVaults: 11 }).problems).toEqual([]);
  expect(checkStorage!(database, { maxBytes: 1_000_000, now: Date.now() + 25 * HOUR }).problems).toEqual([]);
});

it.skipIf(!hasSqlite)('upgrades a database made before vault sizes and creation times were kept', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const old = new DatabaseSync(database);
  old.exec(`
    CREATE TABLE vaults (
      id TEXT PRIMARY KEY, recovery_hash TEXT NOT NULL, recovery_key TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0, snapshot TEXT
    );
    CREATE TABLE devices (
      id TEXT PRIMARY KEY, vault TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL, linked_at INTEGER NOT NULL
    );
  `);
  const token = randomSecret();
  const snapshot = JSON.stringify(envelope('a'));
  old.prepare("INSERT INTO vaults VALUES ('v', 'r', 'k', 3, ?)").run(snapshot);
  // Every device of this one was unlinked, so nothing dates it.
  old.prepare("INSERT INTO vaults VALUES ('orphan', 'r', 'k', 0, NULL)").run();
  old.prepare("INSERT INTO devices VALUES ('d', 'v', ?, ?)").run(
    createHash('sha256').update(token).digest('hex'), Date.now() - 48 * HOUR,
  );
  old.close();

  const app = createSyncApp!(database, { maxBytes: 1000 });
  const history = await app.fetch(new Request('http://localhost/api/sync/history', {
    headers: { Authorization: 'Bearer ' + token },
  }));
  expect(history.headers.get('ETag')).toBe('"3"');
  expect(JSON.stringify(await history.json())).toBe(snapshot);
  app.close();
  // The old vault counts its 244 bytes, and neither old vault looks newly created.
  const result = checkStorage!(database, { maxBytes: 1000, newVaults: 0 });
  expect(result.problems).toEqual([]);
  expect(result.summary).toBe('OK: 2 vaults, 244 of 1000 snapshot bytes (24%)');
});

it.skipIf(!hasSqlite)('flags snapshots refused for a full server in the last 24 hours', async () => {
  const sync = server(300);
  await sync.upload(await sync.vault(), 'a');
  expect((await sync.upload(await sync.vault(), 'b')).status).toBe(507);
  sync.close();
  expect(checkStorage!(database, { maxBytes: 300 }).problems).toContain(
    'Full: 1 snapshot refused in the last 24 hours because the server was full',
  );
  expect(checkStorage!(database, { maxBytes: 300, now: Date.now() + 25 * HOUR }).problems.some(
    (problem) => problem.startsWith('Full:'),
  )).toBe(false);
});
