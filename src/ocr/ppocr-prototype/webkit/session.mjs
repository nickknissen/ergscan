// PROTOTYPE (branch prototype/pp-ocrv6, throwaway): reads photos one after another in one page session through
// the app's UI (a pasted photo, then Discard on the review screen), with either engine, and samples the memory of
// the browser's page process while it does. Then, unless OFFLINE=0, reloads offline and reads the first photo again.
// Usage: node session.mjs <webkit|firefox|chromium> <baseUrl> <ppocr|tess> <outDir> <photo>...
// Writes <outDir>/report.json: per read the time, peak memory, the report lines and the recognized text.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as pw from 'playwright';

const [browserName, base, engine, out, ...photos] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const url = `${base}/${engine === 'ppocr' ? '?ocr=ppocr' : ''}`;
const shots = process.env.SHOTS !== '0';
const consoleLog = [];
const report = { browserName, engine, platform: process.platform, steps: [] };

// Memory: the resident size of the process that runs the page and its workers, and of all browser processes.
// On Linux they are this script's descendants; on macOS WebKit's are XPC services, so they are found by name.
function linuxProcesses() {
  const all = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const status = readFileSync(`/proc/${d}/status`, 'utf8');
      const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' ');
      all.push({ pid: Number(d), ppid: Number(/PPid:\s+(\d+)/.exec(status)[1]), rss: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) * 1024, cmd });
    } catch {}
  }
  const mine = [];
  const walk = (pid) => all.filter((p) => p.ppid === pid).forEach((p) => (mine.push(p), walk(p.pid)));
  walk(process.pid);
  return mine;
}
function macProcesses() {
  return execFileSync('ps', ['-axo', 'pid=,rss=,command='], { encoding: 'utf8' })
    .split('\n')
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), rss: Number(m[2]) * 1024, cmd: m[3] }))
    .filter((p) => /WebKit|Playwright|firefox|chrom/i.test(p.cmd) && !/session\.mjs/.test(p.cmd));
}
const processes = process.platform === 'darwin' ? macProcesses : linuxProcesses;
const isPageProcess = (cmd) => /WebContent|WebKitWebProcess|WPEWebProcess|-contentproc.*\btab\b|--type=renderer/.test(cmd);
let peaks = { page: 0, all: 0 };
const sampler = setInterval(() => {
  const ps = processes();
  peaks.page = Math.max(peaks.page, ...ps.filter((p) => isPageProcess(p.cmd)).map((p) => p.rss));
  peaks.all = Math.max(peaks.all, ps.reduce((a, p) => a + p.rss, 0));
}, 250);
const takePeaks = () => {
  const p = peaks;
  peaks = { page: 0, all: 0 };
  return p;
};
const mb = (b) => Math.round(b / 1048576);

const browser = await pw[browserName].launch();
report.browserVersion = browser.version();
const context = await browser.newContext({ viewport: { width: 412, height: 900 }, locale: 'en-US' });
const page = await context.newPage();
page.on('pageerror', (e) => consoleLog.push(`pageerror: ${e}`));
page.on('console', (m) => consoleLog.push(`${m.type()}: ${m.text()}`));
page.on('requestfailed', (r) => consoleLog.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

const title = () => page.evaluate(() => document.querySelector('.navbar-title')?.textContent.trim());
const waitTitle = (text, timeout) => page.waitForFunction((t) => document.querySelector('.navbar-title')?.textContent.trim() === t, text, { timeout });

async function scan(step, photo) {
  const image = readFileSync(photo).toString('base64');
  const type = photo.endsWith('.webp') ? 'image/webp' : photo.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataTransfer = `(() => { const b = Uint8Array.from(atob(${JSON.stringify(image)}), c => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([b], ${JSON.stringify(basename(photo))}, { type: ${JSON.stringify(type)} })); return dt; })()`;
  takePeaks();
  const started = Date.now();
  // Firefox ignores clipboardData passed to the constructor, so it is attached afterwards.
  await page.evaluate(`(() => { const e = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clipboardData', { value: ${dataTransfer} }); document.dispatchEvent(e); })()`);
  await page.waitForSelector('main.screen-scanning', { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('main.screen-scanning'), null, { timeout: 900_000 });
  const ms = Date.now() - started;
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    title: document.querySelector('.navbar-title')?.textContent.trim(),
    rawText: [...document.querySelectorAll('pre')].map((p) => p.textContent).join('\n---\n'),
    failed: document.querySelector('main')?.innerText.match(/Scanning failed[^\n]*/)?.[0] ?? null,
  }));
  const p = takePeaks();
  const [text, stats = ''] = state.rawText.split('\n\n[PP-OCRv6 prototype]');
  const lines = stats ? `[PP-OCRv6 prototype]${stats}`.split('\n') : [];
  report.steps.push({ step, photo: basename(photo), ms, title: state.title, failed: state.failed, pagePeakMB: mb(p.page), allPeakMB: mb(p.all), report: lines, text });
  console.log(
    `${step} ${basename(photo)}: ${(ms / 1000).toFixed(1)} s, page process ${mb(p.page)} MB, all ${mb(p.all)} MB` +
      `${state.failed ? ` | ${state.failed}` : ''}${lines.length ? ` | ${lines.slice(1).join(' | ').replace(/; Mozilla.*$/, '')}` : ''}`,
  );
  // caret: 'initial' avoids one injected style; WebKit still logs a CSP refusal for the style Playwright adds.
  if (shots) await page.screenshot({ path: `${out}/${step}.png`, caret: 'initial' });
}

async function backToStart() {
  await page.click('.navbar .nav-button');
  await page.getByRole('button', { name: 'Discard' }).click({ timeout: 5_000 }).catch(() => {});
  await waitTitle('ErgScan', 10_000);
}

await page.goto(url);
await page.waitForFunction(() => ['Get the right screen', 'ErgScan'].includes(document.querySelector('.navbar-title')?.textContent.trim()), null, { timeout: 120_000 });
if ((await title()) === 'Get the right screen') {
  await page.click('.navbar .nav-button');
  await waitTitle('ErgScan', 10_000);
}
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 60_000 }).catch(() => consoleLog.push('no service worker controller'));
report.serviceWorker = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
report.simd = await page.evaluate(() =>
  // wasm-feature-detect's SIMD probe: a module with one v128 instruction.
  WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])),
);
await page.waitForTimeout(2000);
report.idlePageMB = mb(takePeaks().page);
console.log(`${browserName} ${report.browserVersion} ${engine}: idle page process ${report.idlePageMB} MB, service worker ${report.serviceWorker}, WebAssembly SIMD ${report.simd}`);

for (const [i, photo] of photos.entries()) {
  try {
    await scan(`read-${i + 1}`, photo);
    await backToStart();
  } catch (e) {
    consoleLog.push(`read-${i + 1} ${basename(photo)} failed: ${e.message.split('\n')[0]}`);
    console.log(`read-${i + 1} ${basename(photo)} failed: ${e.message.split('\n')[0]}`);
    await page.goto(url).catch(() => {});
    await waitTitle('ErgScan', 60_000).catch(() => {});
  }
}

if (process.env.OFFLINE !== '0') {
  await context.setOffline(true);
  await page.goto('about:blank');
  await page.goto(url).catch((e) => consoleLog.push(`offline reload failed: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(1500);
  if ((await title()) === 'ErgScan') await scan('offline', photos[0]).catch((e) => console.log(`offline read failed: ${e.message.split('\n')[0]}`));
  else console.log(`page did not load offline (title ${await title()})`);
}

clearInterval(sampler);
writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, console: consoleLog }, null, 1));
const errors = consoleLog.filter((l) => /^(pageerror|error|requestfailed|offline|no service)/.test(l) && !/Refused to apply a stylesheet|Estimating resolution|diacritics|Image too small|cannot be recognized/.test(l));
console.log(errors.length ? `errors:\n${errors.slice(0, 15).join('\n')}` : 'no errors');
await browser.close();
