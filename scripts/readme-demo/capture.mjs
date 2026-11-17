// Takes the phone screenshots the README demo animates from the real app, and measures where things are on them.
// Writes home.png, review.png (the whole review page), feeling.png (the rated faces), saved.png and shots.js.
// Usage: npm run build && npx vite preview --port 4317, then
//        node scripts/readme-demo/capture.mjs [--url http://127.0.0.1:4317/] [--chrome <path>]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const url = arg('url', 'http://127.0.0.1:4317/');
const photo = join(root, 'testdata/pm5-intervals-8x500m.jpeg');
const profileDir = join(root, '.scratch/readme-demo/capture-profile');
const VIEWPORT = { width: 390, height: 844 };
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

// en-GB gives the date picker a 24 hour clock that fits the field (--lang on Windows and macOS, LANGUAGE on Linux).
const { cdp, close } = await launch({
  port: 9334,
  profileDir,
  argv: process.argv,
  args: ['--lang=en-GB'],
  env: { LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB' },
});
try {
  // Headless Chrome has no share sheet; a phone does, so the export button reads Share FIT as it would there.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'navigator.canShare = () => true;' });
  await cdp('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'dark' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await cdp('Emulation.setLocaleOverride', { locale: 'en-GB' });
  await cdp('Page.enable');
  await cdp('DOM.enable');

  await navigate(url);
  await evaluate(cdp, `localStorage.setItem('ergscan.guideSeen', '1'); localStorage.setItem('ergscan.hideIntro', '1')`);
  await navigate(url);
  await waitFor('.screen-capture .group');
  const cameraFab = await centre('.fab');
  await viewportShot('home.png', 0);

  const { root: doc } = await cdp('DOM.getDocument');
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type=file]:not([capture])' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [photo] });
  await waitFor('.review .editor', 120_000);
  await evaluate(cdp, `(() => {
    const set = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set(document.querySelector('.editor input[type=datetime-local]'), '2026-11-10T12:00');
    set(document.querySelector('.editor input[type=text]'), 'Intervals with the club');
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  })()`);
  await settle();

  const page = await evaluate(cdp, `(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; };
    const rowBox = (tr) => {
      const cells = [...tr.querySelectorAll('td')].filter((td) => td.querySelector('.cell'));
      const a = cells[0].getBoundingClientRect(), b = cells.at(-1).getBoundingClientRect();
      return { x: a.left, y: a.top + scrollY, w: b.right - a.left, h: a.height };
    };
    const header = document.querySelector('.editor .group-header:nth-of-type(2)');
    return {
      height: document.documentElement.scrollHeight,
      bar: document.querySelector('.navbar').getBoundingClientRect().height,
      save: box(document.querySelector('.navbar .primary')),
      face: box(document.querySelector('.feelings button:nth-child(4)')),
      faces: box(document.querySelector('.feelings')),
      splitsAt: box(header).y,
      rows: [document.querySelector('tr.summary'), ...document.querySelectorAll('tbody tr:not(.row-caption):not(.summary)')].slice(0, 8).map(rowBox),
    };
  })()`);
  await fullPageShot('review.png', page.height);

  await evaluate(cdp, `document.querySelector('.feelings button:nth-child(4)').click(); document.activeElement?.blur()`);
  await settle();
  await clipShot('feeling.png', page.faces);

  // Scrolling down collapses the export button; end on a small scroll up so it shows its label.
  const scroll = Math.round(page.splitsAt - page.bar - 8);
  await scrollTo(scroll + 40);
  await scrollTo(scroll);
  await evaluate(cdp, `document.querySelector('.navbar .primary').click()`);
  await waitFor('.fab');
  const shareFab = await centre('.fab');
  await viewportShot('saved.png', null);

  const shots = { viewport: VIEWPORT, cameraFab, scroll, shareFab, ...page };
  writeFileSync(join(here, 'shots.js'), `// Written by capture.mjs: where things are on the screenshots, in CSS pixels of a ${VIEWPORT.width} px wide phone.\nwindow.SHOTS = ${JSON.stringify(shots, null, 2)};\n`);
  console.log('wrote shots.js');
} finally {
  close();
}

async function navigate(target) {
  await cdp('Page.navigate', { url: target });
  await evaluate(cdp, 'new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)))');
}

async function waitFor(selector, timeout = 15_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return settle();
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${selector} did not appear`);
}

function settle() {
  return evaluate(cdp, 'document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 600)))');
}

function centre(selector) {
  return evaluate(cdp, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}

async function save(name, data) {
  writeFileSync(join(here, name), Buffer.from(data, 'base64'));
  console.log(`wrote ${name}`);
}

async function scrollTo(y) {
  await evaluate(cdp, `window.scrollTo(0, ${y})`);
  await settle();
}

/** Screenshot of what the phone shows; `scrollY` null keeps the current scroll position. */
async function viewportShot(name, scrollY) {
  if (scrollY !== null) await scrollTo(scrollY);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  await save(name, data);
}

async function fullPageShot(name, height) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height, scale: 1 } });
  await save(name, data);
}

async function clipShot(name, { x, y, w, h }) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: 1 } });
  await save(name, data);
}
