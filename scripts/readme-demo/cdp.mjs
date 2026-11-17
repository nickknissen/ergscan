// Minimal Chrome DevTools Protocol helpers shared by the README demo scripts.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The Chrome to drive: --chrome <path>, then $CHROME, then a Playwright Chromium, then Chrome on Windows. */
export function chromePath(argv = process.argv) {
  const i = argv.indexOf('--chrome');
  if (i > 0) return argv[i + 1];
  if (process.env.CHROME) return process.env.CHROME;
  const playwright = join(homedir(), '.cache/ms-playwright');
  if (existsSync(playwright)) {
    const builds = readdirSync(playwright).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      for (const dir of ['chrome-linux64', 'chrome-linux']) {
        const bin = join(playwright, build, dir, 'chrome');
        if (existsSync(bin)) return bin;
      }
    }
  }
  return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
}

/** Starts headless Chrome and returns a `cdp(method, params)` function for its first page, plus `close()`. */
export async function launch({ port, profileDir, argv, args = [], env = {} }) {
  const chrome = spawn(
    chromePath(argv),
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, ...args, 'about:blank'],
    { stdio: 'ignore', env: { ...process.env, ...env } },
  );
  try {
    const target = await waitForPage(port);
    const cdp = await connect(target.webSocketDebuggerUrl);
    return { cdp, close: () => chrome.kill() };
  } catch (error) {
    chrome.kill();
    throw error;
  }
}

export async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function waitForPage(port) {
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
    ws.addEventListener('open', () =>
      ready(
        (method, params = {}) =>
          new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
          }),
      ),
    );
  });
}
