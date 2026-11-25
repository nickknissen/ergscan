import { createHash, randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const MAX_SNAPSHOT = 8 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const INVITE_TTL = 5 * 60_000;
// The storage check looks back 24 hours; a week leaves room for a check that missed some runs.
const REFUSAL_TTL = 7 * 24 * 60 * 60_000;
const secretPattern = /^[\w-]{43}$/;
const idPattern = /^[a-f\d-]{36}$/;

/** A whole number of at least `min` from the environment variable `name`, or `fallback` when it is unset. */
export function wholeNumberFromEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${name} must be a whole number of at least ${min}`);
  return value;
}

/** The total snapshot cap, `ERGSCAN_SYNC_MAX_BYTES`. */
export const maxTotalBytesFromEnv = () => wholeNumberFromEnv('ERGSCAN_SYNC_MAX_BYTES', DEFAULT_MAX_TOTAL_BYTES, 1);
export const databaseFromEnv = () => process.env.ERGSCAN_SYNC_DB ?? 'ergscan-sync.sqlite';

/** Whether the module at `url` is the script node was started with. */
export function isEntryPoint(url: string): boolean {
  return Boolean(process.argv[1]) && url === pathToFileURL(resolve(process.argv[1]!)).href;
}

function secret(value: unknown): string {
  if (typeof value !== 'string' || !secretPattern.test(value)) throw new HTTPException(400);
  return value;
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new HTTPException(400);
  return value;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function bearer(context: Context): string {
  const match = /^Bearer ([\w-]{43})$/.exec(context.req.header('Authorization') ?? '');
  if (!match?.[1]) throw new HTTPException(401);
  return hash(match[1]);
}

function envelope(value: unknown, max: number): string {
  if (!value || typeof value !== 'object') throw new HTTPException(400);
  const { nonce, ciphertext } = value as Record<string, unknown>;
  if (typeof nonce !== 'string' || !/^[\w-]{16}$/.test(nonce) ||
      typeof ciphertext !== 'string' || ciphertext.length < 22 || ciphertext.length > max || !/^[\w-]+$/.test(ciphertext)) {
    throw new HTTPException(400);
  }
  return JSON.stringify({ nonce, ciphertext });
}

async function json(context: Context): Promise<Record<string, unknown>> {
  if (context.req.header('Content-Type')?.split(';')[0] !== 'application/json') throw new HTTPException(415);
  const value: unknown = await context.req.json().catch(() => { throw new HTTPException(400); });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HTTPException(400);
  return value as Record<string, unknown>;
}

function inTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = action();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Opens the sync database, creating its tables and bringing an older one up to date. */
export function openSyncDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY, recovery_hash TEXT NOT NULL, recovery_key TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0, snapshot TEXT
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, vault TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL, linked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL,
      vault TEXT REFERENCES vaults(id) ON DELETE CASCADE, wrapped_key TEXT
    );
    -- One row per snapshot refused because the server was full, for the storage check.
    CREATE TABLE IF NOT EXISTS refusals (at INTEGER NOT NULL);
  `);
  const columns = new Set(db.prepare('SELECT name FROM pragma_table_info(?)').all('vaults').map((row) => row.name));
  inTransaction(db, () => {
    if (!columns.has('snapshot_bytes')) {
      // Kept per vault so the total can be summed without reading every snapshot.
      db.exec('ALTER TABLE vaults ADD COLUMN snapshot_bytes INTEGER NOT NULL DEFAULT 0');
      db.exec('UPDATE vaults SET snapshot_bytes = coalesce(length(snapshot), 0)');
    }
    if (!columns.has('created_at')) {
      db.exec('ALTER TABLE vaults ADD COLUMN created_at INTEGER');
      // Older vaults never recorded it; their first device is the closest record. A vault with no devices
      // left counts as created long ago, so upgrading can't look like a burst of new vaults.
      db.exec(`
        UPDATE vaults SET created_at = coalesce((SELECT min(linked_at) FROM devices WHERE vault = vaults.id), 0)
      `);
    }
  });
  // Covering indexes: summing sizes or counting new vaults must not page through 8 MiB snapshots.
  db.exec(`
    CREATE INDEX IF NOT EXISTS vaults_snapshot_bytes ON vaults (snapshot_bytes);
    CREATE INDEX IF NOT EXISTS vaults_created_at ON vaults (created_at);
  `);
  return db;
}

export function createSyncApp(filename: string, { maxBytes = DEFAULT_MAX_TOTAL_BYTES }: { maxBytes?: number } = {}) {
  const db = openSyncDatabase(filename);
  const transaction = <T>(action: () => T) => inTransaction(db, action);

  function device(context: Context) {
    const row = db.prepare('SELECT id, vault FROM devices WHERE token_hash = ?').get(bearer(context));
    if (!row) throw new HTTPException(401);
    return row as { id: string; vault: string };
  }

  function enroll(deviceId: string, vault: string, tokenHash: string) {
    db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?)').run(deviceId, vault, tokenHash, Date.now());
  }

  const app = new Hono().basePath('/api/sync');
  const smallBody = bodyLimit({ maxSize: 4096 });
  app.use('*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
  });
  app.onError((error, context) => {
    if (error instanceof HTTPException) return context.body(null, error.status);
    console.error('ErgScan sync request failed', error.name);
    return context.body(null, 500);
  });

  app.post('/vault', smallBody, async (context) => {
    const body = await json(context);
    const vault = id(body.vault);
    const recovery = hash(secret(body.recovery));
    const wrapped = envelope(body.wrapped, 256);
    const token = bearer(context);
    const deviceId = transaction(() => {
      const existing = db.prepare('SELECT id FROM devices WHERE token_hash = ? AND vault = ?').get(token, vault);
      if (existing) return existing.id;
      if (db.prepare('SELECT id FROM vaults WHERE id = ?').get(vault)) throw new HTTPException(409);
      db.prepare('INSERT INTO vaults (id, recovery_hash, recovery_key, created_at) VALUES (?, ?, ?, ?)')
        .run(vault, recovery, wrapped, Date.now());
      const newId = randomUUID();
      enroll(newId, vault, token);
      return newId;
    });
    return context.json({ id: deviceId }, 201);
  });

  app.post('/recover', smallBody, async (context) => {
    const body = await json(context);
    const vault = id(body.vault);
    const recovery = hash(secret(body.recovery));
    const token = bearer(context);
    const result = transaction(() => {
      const row = db.prepare('SELECT recovery_key FROM vaults WHERE id = ? AND recovery_hash = ?').get(vault, recovery);
      if (!row) throw new HTTPException(401);
      const existing = db.prepare('SELECT id FROM devices WHERE token_hash = ? AND vault = ?').get(token, vault);
      const deviceId = existing?.id ?? randomUUID();
      if (!existing) enroll(String(deviceId), vault, token);
      return { id: deviceId, wrapped: JSON.parse(String(row.recovery_key)) };
    });
    return context.json(result);
  });

  app.post('/pair', smallBody, async (context) => {
    const invite = id((await json(context)).id);
    const token = bearer(context);
    const expiry = transaction(() => {
      db.prepare('DELETE FROM invites WHERE expires <= ?').run(Date.now());
      const existing = db.prepare('SELECT expires FROM invites WHERE id = ? AND token_hash = ?').get(invite, token);
      if (existing) return existing.expires;
      const expires = Date.now() + INVITE_TTL;
      db.prepare('INSERT INTO invites (id, token_hash, expires) VALUES (?, ?, ?)').run(invite, token, expires);
      return expires;
    });
    return context.json({ expires: expiry }, 201);
  });

  app.put('/pair/:id', smallBody, async (context) => {
    const pairing = id(context.req.param('id'));
    const body = await json(context);
    const wrapped = envelope(body.wrapped, 256);
    const vault = device(context).vault;
    const changed = db.prepare(
      'UPDATE invites SET vault = ?, wrapped_key = ? WHERE id = ? AND expires > ? AND vault IS NULL',
    ).run(vault, wrapped, pairing, Date.now()).changes;
    return context.body(null, changed ? 204 : 409);
  });

  app.post('/pair/:id', (context) => {
    const pairing = id(context.req.param('id'));
    const token = bearer(context);
    const paired = transaction(() => {
      const row = db.prepare('SELECT * FROM invites WHERE id = ? AND token_hash = ? AND expires > ?')
        .get(pairing, token, Date.now());
      if (!row) throw new HTTPException(404);
      if (!row.vault) return null;
      const existing = db.prepare('SELECT id FROM devices WHERE id = ? AND token_hash = ?').get(pairing, token);
      if (!existing) enroll(pairing, String(row.vault), token);
      return { id: pairing, vault: row.vault, wrapped: JSON.parse(String(row.wrapped_key)) };
    });
    return paired ? context.json(paired) : context.body(null, 202);
  });

  app.delete('/pair/:id', (context) => {
    const pairing = id(context.req.param('id'));
    db.prepare('DELETE FROM invites WHERE id = ? AND token_hash = ?').run(pairing, bearer(context));
    return context.body(null, 204);
  });

  // Read a validated JSON body before authorizing a write, so revocation during a slow upload takes effect.
  app.put('/history', bodyLimit({ maxSize: MAX_SNAPSHOT + 100 }), async (context) => {
    const value = envelope(await json(context), MAX_SNAPSHOT);
    const { vault, id: deviceId } = device(context);
    const match = /^"(\d+)"$/.exec(context.req.header('If-Match') ?? '');
    if (!match) throw new HTTPException(428);
    const revision = Number(match[1]);
    if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) throw new HTTPException(400);
    const status = transaction(() => {
      // A stale upload is a conflict to merge, not a refusal, even on a full server.
      const current = db.prepare(`
        SELECT 1 FROM vaults WHERE id = ? AND revision = ?
          AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND vault = vaults.id)
      `).get(vault, revision, deviceId);
      if (!current) return 412;
      // The snapshot is ASCII JSON, so its length is its size in bytes; the one it replaces stops counting.
      const { others } = db.prepare(
        'SELECT coalesce(sum(snapshot_bytes), 0) AS others FROM vaults WHERE id != ?',
      ).get(vault) as { others: number };
      if (others + value.length > maxBytes) {
        db.prepare('INSERT INTO refusals VALUES (?)').run(Date.now());
        return 507;
      }
      const changed = db.prepare(`
        UPDATE vaults SET snapshot = ?, snapshot_bytes = ?, revision = revision + 1 WHERE id = ? AND revision = ?
          AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND vault = vaults.id)
      `).run(value, value.length, vault, revision, deviceId).changes;
      return changed ? 204 : 412;
    });
    if (status !== 204) return context.body(null, status);
    context.header('ETag', '"' + (revision + 1) + '"');
    return context.body(null, 204);
  });

  app.get('/history', (context) => {
    const { vault } = device(context);
    const row = db.prepare('SELECT revision, snapshot FROM vaults WHERE id = ?').get(vault);
    if (!row) throw new HTTPException(401);
    const revision = Number(row.revision);
    const etag = '"' + revision + '"';
    context.header('ETag', etag);
    if (context.req.header('If-None-Match') === etag) return context.body(null, 304);
    return context.json(row.snapshot ? JSON.parse(String(row.snapshot)) : null);
  });

  app.get('/devices', (context) => {
    const { vault } = device(context);
    const rows = db.prepare('SELECT id, linked_at AS linkedAt FROM devices WHERE vault = ? ORDER BY linked_at').all(vault);
    return context.json(rows);
  });

  app.delete('/devices/:id', (context) => {
    const remove = id(context.req.param('id'));
    const { vault } = device(context);
    transaction(() => {
      db.prepare('DELETE FROM invites WHERE vault = ? AND id = ?').run(vault, remove);
      db.prepare('DELETE FROM devices WHERE vault = ? AND id = ?').run(vault, remove);
    });
    return context.body(null, 204);
  });

  app.delete('/vault', (context) => {
    db.prepare('DELETE FROM vaults WHERE id = ?').run(device(context).vault);
    return context.body(null, 204);
  });
  const cleanup = setInterval(() => {
    db.prepare('DELETE FROM invites WHERE expires <= ?').run(Date.now());
    db.prepare('DELETE FROM refusals WHERE at <= ?').run(Date.now() - REFUSAL_TTL);
  }, INVITE_TTL);
  cleanup.unref();
  return {
    fetch: app.fetch,
    close() {
      clearInterval(cleanup);
      db.close();
    },
  };
}

if (isEntryPoint(import.meta.url)) {
  const port = Number(process.env.ERGSCAN_SYNC_PORT ?? 8787);
  const host = process.env.ERGSCAN_SYNC_HOST ?? '127.0.0.1';
  const app = createSyncApp(databaseFromEnv(), { maxBytes: maxTotalBytesFromEnv() });
  const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
    console.log(`ErgScan sync listening on ${host}:${port}`);
  });
  server.once('close', app.close);
}
