/**
 * PP-OCRv6 tiny in this same-origin module worker, on onnxruntime-web's WebAssembly build with one thread and no
 * proxy worker (the proxy is made from a blob, which the CSP blocks). The runtime and models load on the first
 * read and stay loaded.
 */
import * as ort from 'onnxruntime-web/wasm';
import { ortSessions, readRgba, type PpocrSessions, type PpocrSettings, type RgbaImage } from './pipeline';

export interface PpocrAssets {
  wasm: string;
  det: string;
  rec: string;
  dict: string;
}

export interface PpocrRequest {
  id: number;
  image: RgbaImage;
  settings: PpocrSettings;
  assets: PpocrAssets;
}

export type PpocrReply = { id: number; progress: number } | { id: number; text: string } | { id: number; error: string };

let engine: Promise<{ sessions: PpocrSessions; dict: string[] }> | null = null;

async function load(assets: PpocrAssets) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { wasm: assets.wasm };
  const get = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  };
  const [det, rec, dict] = await Promise.all([
    get(assets.det).then(async (r) => new Uint8Array(await r.arrayBuffer())),
    get(assets.rec).then(async (r) => new Uint8Array(await r.arrayBuffer())),
    get(assets.dict).then((r) => r.json() as Promise<string[]>),
  ]);
  return { sessions: await ortSessions(ort, det, rec), dict };
}

const post = (reply: PpocrReply) => self.postMessage(reply);

self.onmessage = async ({ data }: MessageEvent<PpocrRequest>) => {
  const { id } = data;
  try {
    engine ??= load(data.assets).catch((error: unknown) => {
      engine = null;
      throw error;
    });
    const { sessions, dict } = await engine;
    const read = await readRgba(data.image, sessions, dict, data.settings, (done, total) => post({ id, progress: done / total }));
    post({ id, text: read.text });
  } catch (error) {
    post({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
