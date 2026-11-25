import { randomUUID } from 'node:crypto';
import { randomSecret } from '../src/sync/crypto';

type SyncApp = { fetch: (request: Request) => Response | Promise<Response> };

/** A snapshot envelope whose stored form ({"nonce":…,"ciphertext":…}) is exactly 244 bytes. */
export function envelope(fill: string) {
  return { nonce: 'n'.repeat(16), ciphertext: fill.repeat(200) };
}
export const ENVELOPE_BYTES = 244;

/** Requests against a sync app as a device holding `token`. */
export function syncClient(app: SyncApp) {
  const call = (path: string, method: string, token: string, body?: unknown, etag?: string) => app.fetch(
    new Request('http://localhost/api/sync/' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(etag === undefined ? {} : { 'If-Match': etag }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return {
    call,
    /** Creates a vault and returns the token of its first device. */
    async vault() {
      const token = randomSecret();
      const created = await call('vault', 'POST', token, {
        vault: randomUUID(), recovery: randomSecret(), wrapped: envelope('w'),
      });
      if (created.status !== 201) throw new Error('Creating a vault failed: ' + created.status);
      return token;
    },
    upload: (token: string, fill: string, etag = '"0"') => call('history', 'PUT', token, envelope(fill), etag),
  };
}
