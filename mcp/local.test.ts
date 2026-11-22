import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { HistoryEntry } from '../src/core/history';
import { emptyRow } from '../src/core/workout';
import { approveInvite, closeInvite, inviteCode } from '../src/sync/client';
import { randomSecret, recoverySecrets, seal } from '../src/sync/crypto';
import type { Snapshot } from '../src/sync/merge';
import type { Device } from '../src/sync/store';
import { approvalUrl, historyLoader, link, readLinked, saveLinked } from './local';
import { createMcpServer } from './server';

const sqlite = Boolean(process.getBuiltinModule?.('node:sqlite'));
const prefix = 'ergscan-sync-v1';

let origin = '';
let close = () => {};
let phone: Device;
let revision = 0;

/** What the phone's app does: encrypt the history and upload it over the last revision. */
async function upload(entries: HistoryEntry[]) {
  const snapshot: Snapshot = {
    version: 1,
    records: entries.map((entry) => ({ id: entry.id, revision: randomUUID(), entry })),
    applied: [[phone.id, ++revision]],
  };
  const response = await fetch(origin + '/api/sync/history', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + phone.token, 'Content-Type': 'application/json', 'If-Match': `"${revision - 1}"` },
    body: JSON.stringify(await seal(snapshot, phone.key, prefix + '/history/' + phone.vault)),
  });
  expect(response.status).toBe(204);
}

function piece(id: string, startTime: string, distanceM: number, durationDs: number): HistoryEntry {
  const summary = { ...emptyRow(), distanceM, durationDs };
  return {
    id, extraColumn: null,
    workout: {
      startTime: new Date(startTime), splitDistance: 500, dragFactor: 120, name: null, notes: 'Easy', feeling: 4,
      summary, rows: [{ ...summary }], heartRates: null,
    },
  };
}

beforeAll(async () => {
  if (!sqlite) return;
  const { createSyncApp } = await import('../server/sync');
  const app = createSyncApp(':memory:');
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => { server.close(); app.close(); };

  // The phone turns on sync, as createVault does.
  const vault = randomUUID();
  const master = randomSecret();
  const { access, wrapping } = await recoverySecrets(master, vault);
  phone = { id: '', vault, token: randomSecret(), key: randomSecret() };
  const response = await fetch(origin + '/api/sync/vault', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + phone.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault, recovery: access, wrapped: await seal(phone.key, wrapping, prefix + '/recovery/' + vault) }),
  });
  phone.id = (await response.json() as { id: string }).id;
  await upload([piece('a', '2026-11-18T06:00:00Z', 2000, 4500), piece('b', '2026-11-20T17:00:00Z', 5000, 12000)]);
});

afterAll(() => close());

it.skipIf(!sqlite)('links like a new device, answers from the decrypted history, and stops when removed', async () => {
  let shown = '';
  const device = await link(origin, {
    pollMs: 1,
    onInvite: async (invite) => {
      shown = approvalUrl(origin, invite);
      // The phone scans the code; the app strips everything up to #link/ before approving.
      await approveInvite(phone, shown.replace(/^.*#link\//, ''), origin);
    },
  });
  expect(shown).toMatch(new RegExp(`^${origin}/#link/${prefix}\\.link\\.`));
  expect(device.vault).toBe(phone.vault);
  expect(device.key).toBe(phone.key);

  const dir = await mkdtemp(join(tmpdir(), 'ergscan-mcp-'));
  try {
    const path = join(dir, 'config', 'device.json');
    await saveLinked(path, { server: origin, device });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const linked = (await readLinked(path))!;
    expect(linked.device).toEqual(device);

    const client = new Client({ name: 'test', version: '1' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(historyLoader(linked), 'Europe/Copenhagen').connect(serverSide);
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: { text: string }[] };
      return { isError: result.isError ?? false, text: result.content[0]!.text };
    };

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['list_workouts', 'get_workout']);
    const list = JSON.parse((await call('list_workouts')).text);
    expect(list.total).toBe(2);
    expect(list.workouts.map((w: { id: string }) => w.id)).toEqual(['b', 'a']);
    expect(list.workouts[0]).toMatchObject({ start: '2026-11-20T18:00:00+01:00', distanceM: 5000, pacePer500: '2:00.0', feeling: 4, notes: 'Easy' });
    expect(JSON.parse((await call('list_workouts', { since: '2026-11-19' })).text).total).toBe(1);
    expect(JSON.parse((await call('get_workout', { id: 'a' })).text).splits).toHaveLength(1);
    expect(await call('get_workout', { id: 'nope' })).toEqual({ isError: true, text: 'No workout with id nope. Use list_workouts to find one.' });
    expect((await call('list_workouts', { since: 'last week' })).isError).toBe(true);

    // A workout saved on the phone shows up on the next call.
    await upload([piece('a', '2026-11-18T06:00:00Z', 2000, 4500), piece('b', '2026-11-20T17:00:00Z', 5000, 12000), piece('c', '2026-11-22T07:00:00Z', 1000, 2100)]);
    expect(JSON.parse((await call('list_workouts')).text).total).toBe(3);

    // Removed under Show linked devices on the phone.
    const removed = await fetch(origin + '/api/sync/devices/' + device.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + phone.token } });
    expect(removed.status).toBe(204);
    const revoked = await call('list_workouts');
    expect(revoked.isError).toBe(true);
    expect(revoked.text).toContain('no longer linked');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it.skipIf(!sqlite)('gives up when the invite is gone, and closes it when cancelled', async () => {
  await expect(link(origin, { pollMs: 1, onInvite: (invite) => closeInvite(invite, origin) }))
    .rejects.toThrow('expired before it was approved');

  const controller = new AbortController();
  let code = '';
  const linking = link(origin, {
    pollMs: 60_000, signal: controller.signal,
    onInvite: (invite) => { code = inviteCode(invite); controller.abort(); },
  });
  await expect(linking).rejects.toThrow();
  // The invite was closed, so approving it now finds nothing.
  await expect(approveInvite(phone, code, origin)).rejects.toMatchObject({ status: 409 });
});
