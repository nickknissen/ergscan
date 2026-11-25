/**
 * PROTOTYPE (branch prototype/pp-ocrv6, throwaway): PP-OCRv6 tiny in this same-origin module worker, on
 * onnxruntime-web's WebAssembly build with one thread and no proxy worker (the proxy is made from a blob, which
 * the CSP blocks). See docs/research/ocr-accuracy.md, 4.2 and R2.
 */
import * as ort from 'onnxruntime-web/wasm';
import { ortSessions, PPOCR_SETTINGS, readRgba, type PpocrSessions, type RgbaImage } from './pipeline';

export interface PpocrAssets {
  wasm: string;
  det: string;
  rec: string;
  dict: string;
}

export interface PpocrRequest {
  id: number;
  image: RgbaImage;
  assets: PpocrAssets;
}

export interface PpocrResult {
  text: string;
  boxes: number;
  /** Fetching the runtime and models and starting both sessions; null when they were already loaded. */
  loadMs: number | null;
  detMs: number;
  recMs: number;
  detSize: [number, number];
  /** Size of the runtime's WebAssembly memory. It never shrinks, so this is its peak so far. */
  wasmBytes: number | null;
}

export type PpocrReply = { id: number; progress: number } | { id: number; result: PpocrResult } | { id: number; error: string };

// Keep the WebAssembly.Memory the runtime starts with, to report its size.
const memories = new Set<WebAssembly.Memory>();
function collect(...sources: unknown[]) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const value of Object.values(source)) {
      if (value instanceof WebAssembly.Memory) memories.add(value);
      else if (value && typeof value === 'object') for (const inner of Object.values(value)) if (inner instanceof WebAssembly.Memory) memories.add(inner);
    }
  }
}
const instantiate = WebAssembly.instantiate.bind(WebAssembly) as (source: unknown, imports?: WebAssembly.Imports) => Promise<unknown>;
WebAssembly.instantiate = (async (source: unknown, imports?: WebAssembly.Imports) => {
  const result = await instantiate(source, imports);
  collect(imports, result instanceof WebAssembly.Instance ? result.exports : (result as WebAssembly.WebAssemblyInstantiatedSource).instance.exports);
  return result;
}) as typeof WebAssembly.instantiate;
const streaming = WebAssembly.instantiateStreaming?.bind(WebAssembly);
if (streaming) {
  WebAssembly.instantiateStreaming = async (source, imports) => {
    const result = await streaming(source, imports);
    collect(imports, result.instance.exports);
    return result;
  };
}

let engine: Promise<{ sessions: PpocrSessions; dict: string[]; loadMs: number }> | null = null;

async function load(assets: PpocrAssets) {
  const started = performance.now();
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
  return { sessions: await ortSessions(ort, det, rec), dict, loadMs: performance.now() - started };
}

const post = (reply: PpocrReply) => self.postMessage(reply);

self.onmessage = async ({ data }: MessageEvent<PpocrRequest>) => {
  const { id } = data;
  try {
    const fresh = !engine;
    engine ??= load(data.assets).catch((error: unknown) => {
      engine = null;
      throw error;
    });
    const { sessions, dict, loadMs } = await engine;
    const read = await readRgba(data.image, sessions, dict, PPOCR_SETTINGS, (done, total) => post({ id, progress: done / total }));
    const wasmBytes = memories.size ? [...memories].reduce((sum, m) => sum + m.buffer.byteLength, 0) : null;
    post({ id, result: { text: read.text, boxes: read.boxes, detMs: read.detMs, recMs: read.recMs, detSize: read.detSize, loadMs: fresh ? loadMs : null, wasmBytes } });
  } catch (error) {
    post({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
