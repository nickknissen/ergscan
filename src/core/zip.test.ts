import { describe, expect, it } from 'vitest';
import { isZip, readZipEntry } from './zip';

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A minimal ZIP archive, laid out the way zip tools write one (CRCs left at zero: the reader does not check them). */
async function zip(files: { name: string; data: Uint8Array; deflated?: boolean }[], comment = ''): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const body = file.deflated ? await deflate(file.data) : file.data;
    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, file.deflated ? 8 : 0, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, file.deflated ? 8 : 0, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const commentBytes = encoder.encode(comment);
  const centralSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22 + commentBytes.length);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, commentBytes.length, true);
  end.set(commentBytes, 22);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const fitName = (name: string) => name.toLowerCase().endsWith('.fit');
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array | null) => (data === null ? null : new TextDecoder().decode(data));

describe('readZipEntry', () => {
  it('reads a deflated entry, as in a Garmin Connect export', async () => {
    const content = bytes('FIT data '.repeat(500));
    const archive = await zip([{ name: '25121807799_ACTIVITY.fit', data: content, deflated: true }]);
    expect(isZip(archive)).toBe(true);
    expect(text(await readZipEntry(archive, fitName))).toBe(text(content));
  });

  it('reads a stored entry and skips files that do not match', async () => {
    const archive = await zip([
      { name: 'readme.txt', data: bytes('not this') },
      { name: 'ride.FIT', data: bytes('this one') },
    ]);
    expect(text(await readZipEntry(archive, fitName))).toBe('this one');
  });

  it('finds the directory behind an archive comment', async () => {
    const archive = await zip([{ name: 'a.fit', data: bytes('x') }], 'exported by a watch');
    expect(text(await readZipEntry(archive, fitName))).toBe('x');
  });

  it('returns null when nothing matches', async () => {
    const archive = await zip([{ name: 'notes.txt', data: bytes('x') }]);
    expect(await readZipEntry(archive, fitName)).toBeNull();
  });

  it('rejects data that is not a ZIP archive', async () => {
    expect(isZip(bytes('.FIT'))).toBe(false);
    await expect(readZipEntry(bytes('just some bytes, no archive here'), fitName)).rejects.toThrow('Not a ZIP');
  });
});
