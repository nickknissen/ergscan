export const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

interface Updatable {
  update(): Promise<unknown>;
}

interface Timers {
  setInterval(handler: () => void, ms: number): unknown;
}

export function watchForUpdates(registration: Updatable, doc: Document, timers: Timers = globalThis, intervalMs = UPDATE_INTERVAL_MS) {
  const check = () => void registration.update().catch(() => {});
  timers.setInterval(check, intervalMs);
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') check();
  });
}
