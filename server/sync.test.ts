import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { randomSecret, recoverySecrets, seal, unseal } from '../src/sync/crypto';
import { ENVELOPE_BYTES, syncClient } from './testClient';

const createSyncApp = process.getBuiltinModule?.('node:sqlite') ? (await import('./sync')).createSyncApp : null;

it.skipIf(!createSyncApp)('links private history, handles races, recovers, and invalidates a deleted vault', async () => {
  const app = createSyncApp!(':memory:');
  try {
    const vault = randomUUID();
    const key = randomSecret();
    const token = randomSecret();
    const desktop = randomSecret();
    const pairing = randomUUID();
    const qrSecret = randomSecret();
    const recoveryToken = randomSecret();
    const master = randomSecret();
    const recovery = await recoverySecrets(master, vault);
    const wrapped = await seal(key, recovery.wrapping, vault);
    const request = (path: string, method: string, credential: string, body?: unknown, etag?: string) => app.fetch(
      new Request('http://localhost/api/sync/' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + credential,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(etag === undefined ? {} : { 'If-Match': etag }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

    expect((await request('vault', 'POST', token, { vault, recovery: recovery.access, wrapped })).status).toBe(201);
    expect((await request('history', 'GET', desktop)).status).toBe(401);
    expect((await request('pair', 'POST', desktop, { id: pairing })).status).toBe(201);
    expect((await request('pair/' + pairing, 'POST', desktop)).status).toBe(202);
    const pairedKey = await seal(key, qrSecret, pairing);
    expect((await request('pair/' + pairing, 'PUT', token, { wrapped: pairedKey })).status).toBe(204);
    expect((await request('pair/' + pairing, 'PUT', token, { wrapped: pairedKey })).status).toBe(409);
    expect((await request('pair/' + pairing, 'POST', randomSecret())).status).toBe(404);
    const claim = await request('pair/' + pairing, 'POST', desktop);
    expect(await unseal((await claim.json()).wrapped, qrSecret, pairing)).toBe(key);
    expect((await request('pair/' + pairing, 'DELETE', desktop)).status).toBe(204);
    expect((await request('pair/' + pairing, 'POST', desktop)).status).toBe(404);

    const contents = { notes: 'Private workout' };
    const snapshot = await seal(contents, key, vault);
    const initial = await request('history', 'GET', desktop);
    expect(initial.headers.get('ETag')).toBe('"0"');
    const writes = await Promise.all([
      request('history', 'PUT', token, snapshot, '"0"'), request('history', 'PUT', desktop, snapshot, '"0"'),
    ]);
    expect(writes.map((response) => response.status).sort()).toEqual([204, 412]);
    const history = await request('history', 'GET', desktop);
    expect(history.headers.get('Cache-Control')).toBe('no-store');
    expect(history.headers.get('ETag')).toBe('"1"');
    const ciphertext = await history.text();
    expect(ciphertext).not.toContain(contents.notes);
    expect(await unseal(JSON.parse(ciphertext), key, vault)).toEqual(contents);

    expect((await request('devices/' + pairing, 'DELETE', token)).status).toBe(204);
    expect((await request('history', 'PUT', desktop, snapshot, '"1"')).status).toBe(401);
    const recovered = await request('recover', 'POST', recoveryToken, { vault, recovery: recovery.access });
    expect(await unseal((await recovered.json()).wrapped, recovery.wrapping, vault)).toBe(key);
    expect((await request('vault', 'DELETE', recoveryToken)).status).toBe(204);
    expect((await request('history', 'PUT', token, snapshot, '"1"')).status).toBe(401);
    expect((await request('recover', 'POST', randomSecret(), { vault, recovery: recovery.access })).status).toBe(401);
  } finally {
    app.close();
  }
});

it.skipIf(!createSyncApp)('refuses snapshots once the server holds its total byte cap, until space is freed', async () => {
  // One stored envelope fits, two don't.
  const app = createSyncApp!(':memory:', { maxBytes: ENVELOPE_BYTES + 50 });
  try {
    const { call, vault, upload } = syncClient(app);
    const first = await vault();
    const second = await vault();

    expect((await upload(first, 'a')).status).toBe(204);
    expect((await upload(second, 'b')).status).toBe(507);
    const unchanged = await call('history', 'GET', second);
    expect(unchanged.headers.get('ETag')).toBe('"0"');
    expect(await unchanged.json()).toBeNull();
    // A stale upload is still a conflict to merge, not a refusal.
    expect((await upload(second, 'b', '"7"')).status).toBe(412);

    // Replacing a snapshot only counts its new size.
    expect((await upload(first, 'c', '"1"')).status).toBe(204);
    // The per-snapshot body limit still answers first.
    const oversized = { nonce: 'n'.repeat(16), ciphertext: 'x'.repeat(8 * 1024 * 1024 + 200) };
    expect((await call('history', 'PUT', second, oversized, '"0"')).status).toBe(413);

    expect((await call('vault', 'DELETE', first)).status).toBe(204);
    expect((await upload(second, 'b')).status).toBe(204);
  } finally {
    app.close();
  }
});
