// Renders index.html frame by frame in headless Chrome and encodes the README GIF.
// Usage: node scripts/readme-demo/render.mjs [--fps 15] [--chrome <path>]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const fps = Number(arg('fps', 15));
const chromePath = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const work = join(root, '.scratch/readme-demo');
const framesDir = join(work, 'frames');
const output = join(root, '.github/readme-demo.gif');
const port = 9333;

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(dirname(output), { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, 'chrome-profile')}`, 'about:blank',
], { stdio: 'ignore' });

try {
  const target = await waitForPage();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 2, mobile: false });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `${pathToFileURL(join(here, 'index.html')).href}?capture` });
  await evaluate(cdp, 'new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)))');
  await evaluate(cdp, 'window.demoReady');
  const duration = await evaluate(cdp, 'window.DEMO_DURATION');
  const count = Math.round(duration * fps);

  for (let i = 0; i < count; i++) {
    await evaluate(cdp, `renderAt(${i / fps})`);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 960, height: 600, scale: 1 } });
    writeFileSync(join(framesDir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
    if (i % 50 === 0) console.log(`frame ${i}/${count}`);
  }
  console.log(`${count} frames at ${fps} fps`);
} finally {
  chrome.kill();
}

await run('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(framesDir, 'f%04d.png'),
  '-vf', 'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  '-loop', '0', output,
]);
console.log(`wrote ${output}`);

async function waitForPage() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chrome did not start');
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const handler = pending.get(msg.id);
    if (!handler) return;
    pending.delete(msg.id);
    msg.error ? handler.reject(new Error(msg.error.message)) : handler.resolve(msg.result);
  });
  return new Promise((ready, fail) => {
    ws.addEventListener('error', fail);
    ws.addEventListener('open', () => ready((method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    })));
  });
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited with ${code}`))));
  });
}
