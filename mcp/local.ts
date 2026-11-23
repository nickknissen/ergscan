import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { HistoryEntry } from '../src/core/history';
import {
  claimInvite, closeInvite, createInvite, downloadHistory, inviteCode, SyncError, type Invite,
} from '../src/sync/client';
import type { Device } from '../src/sync/store';
import { COMMAND } from './command';
import type { LoadHistory } from './server';

/**
 * The local MCP server is a linked device of its own: it holds the vault key on this computer,
 * downloads the encrypted history and decrypts it here. The sync server never sees it in plain text.
 */
export interface LinkedDevice {
  /** Origin of the ErgScan deployment, e.g. "https://ergscan.example". */
  server: string;
  device: Device;
}

export function devicePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ERGSCAN_MCP_DEVICE) return env.ERGSCAN_MCP_DEVICE;
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'ergscan-mcp', 'device.json');
}

export async function readLinked(path: string): Promise<LinkedDevice | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const value = JSON.parse(text) as Partial<LinkedDevice>;
  const device = value.device;
  if (typeof value.server !== 'string' || !device ||
      !(['id', 'vault', 'token', 'key'] as const).every((field) => typeof device[field] === 'string')) {
    throw new Error(`${path} is not an ErgScan device file. Delete it and run \`${COMMAND} link\` again.`);
  }
  return { server: value.server, device };
}

/** Readable only by this user: the file holds the key to the whole history. */
export async function saveLinked(path: string, linked: LinkedDevice): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(linked, null, 2) + '\n', { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function forgetLinked(path: string): Promise<void> {
  await rm(path, { force: true });
}

/** The origin of a deployment address. Plain HTTP only for this computer, as browsers allow. */
export function serverOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${value} is not an address, e.g. https://ergscan.example`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error(`${value} must use https`);
  }
  return url.origin;
}

/** The address the app opens to approve an invite, as in its own pairing QR code. */
export function approvalUrl(origin: string, invite: Invite): string {
  return `${origin}/#link/${inviteCode(invite)}`;
}

/**
 * Links this computer the way a new phone or tablet is linked: it creates an invite, shows it with
 * `onInvite`, and waits until a device that already syncs approves it.
 */
export async function link(
  origin: string,
  { onInvite, signal, pollMs = 1800 }: { onInvite: (invite: Invite) => void | Promise<void>; signal?: AbortSignal; pollMs?: number },
): Promise<Device> {
  const invite = await createInvite(origin);
  try {
    await onInvite(invite);
    while (Date.now() < invite.expires) {
      await delay(pollMs, undefined, { signal });
      try {
        const device = await claimInvite(invite, origin);
        if (device) return device;
      } catch (error) {
        if (error instanceof SyncError && error.status === 404) break;
        // Anything else may pass, like a dropped connection; keep waiting until the invite expires.
      }
    }
    throw new Error(`The pairing code expired before it was approved. Run \`${COMMAND} link\` again.`);
  } finally {
    await closeInvite(invite, origin).catch(() => {});
  }
}

/**
 * Loads the history for each tool call, so the agent sees edits made since. The server answers
 * "not modified" when nothing changed, and the decrypted copy is kept in memory only.
 */
export function historyLoader({ server, device }: LinkedDevice): LoadHistory {
  let cached: { etag: string; entries: HistoryEntry[] } | null = null;
  return async () => {
    let downloaded;
    try {
      downloaded = await downloadHistory(device, { origin: server, etag: cached?.etag });
    } catch (error) {
      if (error instanceof SyncError && error.status === 401) {
        throw new Error(`This computer is no longer linked to ErgScan at ${server}. Run \`${COMMAND} link\` in a terminal to link it again.`);
      }
      if (error instanceof SyncError) throw new Error(`ErgScan at ${server} answered with status ${error.status}.`);
      throw new Error(`Could not reach ErgScan at ${server}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (downloaded) {
      const entries = downloaded.snapshot.records.flatMap(({ entry }) => entry ? [entry] : []);
      cached = { etag: downloaded.etag, entries };
    }
    return cached?.entries ?? [];
  };
}
