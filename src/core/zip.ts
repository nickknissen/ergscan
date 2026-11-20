const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === LOCAL_FILE_HEADER;
}

/**
 * The contents of the first file in a ZIP archive whose name `matches`, or null if none does.
 * Handles stored and deflated entries, which covers the archives Garmin Connect exports.
 */
export async function readZipEntry(bytes: Uint8Array, matches: (name: string) => boolean): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(view);
  if (end === null) throw new Error('Not a ZIP archive');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const names = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== CENTRAL_FILE_HEADER) throw new Error('Damaged ZIP archive');
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (!matches(name)) continue;

    if (view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER) throw new Error('Damaged ZIP archive');
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === STORED) return data;
    if (method === DEFLATED) return inflate(data);
    throw new Error(`Unsupported ZIP compression ${method}`);
  }
  return null;
}

function findEndOfCentralDirectory(view: DataView): number | null {
  // The record is 22 bytes plus a comment of up to 65535 bytes, at the very end.
  for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === END_OF_CENTRAL_DIRECTORY) return at;
  }
  return null;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
