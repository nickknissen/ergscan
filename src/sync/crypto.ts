export interface Envelope {
  nonce: string;
  ciphertext: string;
}

const encoder = new TextEncoder();

export function encode(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  }
  return btoa(chunks.join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0));
}

export function randomSecret(): string {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}

async function aesKey(secret: string) {
  return crypto.subtle.importKey('raw', decode(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value: unknown, secret: string, context: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    await aesKey(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return { nonce: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}

export async function unseal(value: Envelope, secret: string, context: string): Promise<unknown> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(value.nonce), additionalData: encoder.encode(context) },
    await aesKey(secret),
    decode(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function recoverySecrets(master: string, vault: string) {
  const key = await crypto.subtle.importKey('raw', decode(master), 'HKDF', false, ['deriveBits']);
  async function derive(purpose: string) {
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(vault), info: encoder.encode('ergscan-v1/' + purpose) },
      key,
      256,
    );
    return encode(new Uint8Array(bits));
  }
  const [access, wrapping] = await Promise.all([derive('recovery-access'), derive('recovery-wrapping')]);
  return { access, wrapping };
}
