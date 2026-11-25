import { randomSecret, recoverySecrets, seal, unseal, type Envelope } from './crypto';
import { emptySnapshot, merge, parseSnapshot, type Snapshot } from './merge';
import type { Device, HistoryStore } from './store';

export class SyncError extends Error {
  constructor(readonly status: number) { super('Sync request failed (' + status + ')'); }
}

/** The sync status to show after a failed sync. */
export function syncFailureStatus(error: unknown): 'unlinked' | 'tooLarge' | 'serverBusy' | 'failed' {
  if (!(error instanceof SyncError)) return 'failed';
  if (error.status === 401) return 'unlinked';
  if (error.status === 413) return 'tooLarge';
  // Rate limited, or the server has no room for more history: neither is this device's fault.
  if (error.status === 429 || error.status === 507) return 'serverBusy';
  return 'failed';
}

export interface Invite {
  id: string;
  secret: string;
  token: string;
  expires: number;
}

const prefix = 'ergscan-sync-v1';
const secretPattern = /^[\w-]{43}$/;

function code(kind: string, id: string, secret: string) {
  return [prefix, kind, id, secret].join('.');
}

function parseCode(value: string, kind: string) {
  const [version, type, id, secret, trailing] = value.trim().split('.');
  if (version !== prefix || type !== kind || !id || !/^[a-f\d-]{36}$/.test(id) ||
      !secret || !secretPattern.test(secret) || trailing !== undefined) throw new SyncError(400);
  return { id, secret };
}

export function inviteCode(invite: Invite): string {
  return code('link', invite.id, invite.secret);
}

function validatedKey(value: unknown): string {
  if (typeof value !== 'string' || !secretPattern.test(value)) throw new SyncError(400);
  return value;
}

/**
 * Requests go to the page's own origin. Code running outside the app, like the local MCP server,
 * passes the origin of the deployment instead, e.g. "https://ergscan.example".
 */
async function request(
  path: string,
  { token, method = 'GET', body, etag, unchanged, origin = '' }: {
    token: string; method?: string; body?: unknown; etag?: string; unchanged?: string; origin?: string;
  },
) {
  const headers = new Headers({ Authorization: 'Bearer ' + token });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (etag) headers.set('If-Match', etag);
  if (unchanged) headers.set('If-None-Match', unchanged);
  return fetch(origin + '/api/sync/' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
}

async function checked(...args: Parameters<typeof request>) {
  const response = await request(...args);
  if (!response.ok) throw new SyncError(response.status);
  return response;
}

export async function createVault(store: HistoryStore): Promise<string> {
  const vault = crypto.randomUUID();
  const token = randomSecret();
  const key = randomSecret();
  const master = randomSecret();
  const { access, wrapping } = await recoverySecrets(master, vault);
  const wrapped = await seal(key, wrapping, prefix + '/recovery/' + vault);
  const response = await checked('vault', { token, method: 'POST', body: { vault, recovery: access, wrapped } });
  const { id } = await response.json() as { id: string };
  await store.attach({ id, token, vault, key });
  return code('recover', vault, master);
}

export async function recoverVault(store: HistoryStore, value: string) {
  const { id: vault, secret: master } = parseCode(value, 'recover');
  const token = randomSecret();
  const { access, wrapping } = await recoverySecrets(master, vault);
  const response = await checked('recover', { token, method: 'POST', body: { vault, recovery: access } });
  const { id, wrapped } = await response.json() as { id: string; wrapped: Envelope };
  const key = validatedKey(await unseal(wrapped, wrapping, prefix + '/recovery/' + vault));
  await store.attach({ id, vault, token, key });
}

export async function createInvite(origin = ''): Promise<Invite> {
  const id = crypto.randomUUID();
  const token = randomSecret();
  const response = await checked('pair', { token, method: 'POST', body: { id }, origin });
  const { expires } = await response.json() as { expires: number };
  return { id, expires, token, secret: randomSecret() };
}

export async function approveInvite(device: Device, value: string, origin = '') {
  const { id, secret } = parseCode(value, 'link');
  const wrapped = await seal(device.key, secret, prefix + '/link/' + id + '/' + device.vault);
  await checked('pair/' + id, { method: 'PUT', token: device.token, body: { wrapped }, origin });
}

export async function claimInvite(invite: Invite, origin = ''): Promise<Device | null> {
  const response = await checked('pair/' + invite.id, { method: 'POST', token: invite.token, origin });
  if (response.status === 202) return null;
  const { vault, wrapped } = await response.json() as { vault: string; wrapped: Envelope };
  const key = validatedKey(await unseal(wrapped, invite.secret, prefix + '/link/' + invite.id + '/' + vault));
  return { id: invite.id, vault, token: invite.token, key };
}

export async function closeInvite(invite: Invite, origin = '') {
  await checked('pair/' + invite.id, { method: 'DELETE', token: invite.token, origin });
}

export async function listDevices(device: Device): Promise<{ id: string; linkedAt: number }[]> {
  const response = await checked('devices', { token: device.token });
  return response.json();
}

export async function revokeDevice(device: Device, id: string, origin = '') {
  await checked('devices/' + id, { method: 'DELETE', token: device.token, origin });
}

/**
 * The synced history as a device that only reads: null when it has not changed since `etag`.
 * Never uploads, so it leaves the device's sequence and other devices' edits alone.
 */
export async function downloadHistory(
  device: Device, { origin = '', etag }: { origin?: string; etag?: string } = {},
): Promise<{ etag: string; snapshot: Snapshot } | null> {
  const response = await request('history', { token: device.token, unchanged: etag, origin });
  if (response.status === 304) return null;
  if (!response.ok) throw new SyncError(response.status);
  const revision = response.headers.get('ETag');
  if (!revision) throw new SyncError(502);
  const payload = await response.json() as Envelope | null;
  const snapshot = payload === null ? emptySnapshot() :
    parseSnapshot(await unseal(payload, device.key, prefix + '/history/' + device.vault));
  return { etag: revision, snapshot };
}

export async function deleteVault(device: Device) {
  await checked('vault', { method: 'DELETE', token: device.token });
}

async function exchange(store: HistoryStore) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { device, pending, etag, snapshot: local } = await store.read();
    if (!device) return;
    const context = prefix + '/history/' + device.vault;
    const { token } = device;
    const response = await request('history', { token, unchanged: etag ?? undefined });
    if (!response.ok && response.status !== 304) throw new SyncError(response.status);
    if (response.status === 304 && pending.length === 0) return;
    let revision = response.headers.get('ETag');
    if (!revision) throw new SyncError(502);
    const payload: Envelope | null = response.status === 304 ? null : await response.json();
    const remote = response.status === 304 ? local :
      payload === null ? emptySnapshot() : parseSnapshot(await unseal(payload, device.key, context));
    const sequence = remote.applied.find(([id]) => id === device.id)?.[1] ?? 0;
    const unsent = pending.filter((change) => change.sequence > sequence);
    let snapshot = remote;
    if (unsent.length) {
      snapshot = merge(remote, device.id, unsent);
      const envelope = await seal(snapshot, device.key, context);
      const current = await store.read();
      if (current.device?.token !== token) return;
      if (current.etag !== etag) continue;
      const uploaded = await request('history', { method: 'PUT', token, body: envelope, etag: revision });
      if (uploaded.status === 412) continue;
      if (!uploaded.ok) throw new SyncError(uploaded.status);
      revision = uploaded.headers.get('ETag');
      if (!revision) throw new SyncError(502);
    }
    await store.accept(device, etag, snapshot, revision);
    return;
  }
  throw new SyncError(412);
}

export function syncHistory(store: HistoryStore) {
  return navigator.locks ?
    navigator.locks.request('ergscan-sync', () => exchange(store)) : exchange(store);
}
