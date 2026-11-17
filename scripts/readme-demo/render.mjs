// Renders index.html frame by frame in headless Chrome and encodes the README GIF.
// Refresh the phone screenshots first with capture.mjs when the app's screens change.
// Usage: node scripts/readme-demo/render.mjs [--fps 15] [--chrome <path>]
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { evaluate, launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const fps = Number(arg('fps', 15));
const work = join(root, '.scratch/readme-demo');
const framesDir = join(work, 'frames');
const output = join(root, '.github/readme-demo.gif');

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(dirname(output), { recursive: true });

const { cdp, close } = await launch({ port: 9333, profileDir: join(work, 'chrome-profile'), argv: process.argv });
try {
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
  close();
}

const frames = readdirSync(framesDir).sort().map((f) => join(framesDir, f));
const scaled = await Promise.all(frames.map((f) => sharp(f).resize({ width: 960, kernel: 'lanczos3' }).png().toBuffer()));
await sharp(scaled, { join: { animated: true } })
  .gif({ delay: Math.round(1000 / fps), loop: 0, effort: 10, dither: 0.6, interFrameMaxError: 4, interPaletteMaxError: 8 })
  .toFile(output);
console.log(`wrote ${output}`);
