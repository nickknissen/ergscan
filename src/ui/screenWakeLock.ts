/**
 * Keeps the screen on until the returned function is called. The browser drops the lock whenever the page is hidden,
 * so it's asked for again each time the page is shown. Where there's no wake lock, or the browser refuses one (battery
 * saver, a permissions policy), the screen just sleeps as usual: nothing is logged, shown or retried.
 */
export function holdScreenWakeLock(): () => void {
  if (!('wakeLock' in navigator)) return () => {};

  let stopped = false;
  let lock: WakeLockSentinel | null = null;

  const requestWhenVisible = () => {
    if (document.visibilityState !== 'visible') return;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        // A slow request can land after the page was hidden or the hold stopped, or after a later request
        // already got one, so only one lock is ever kept.
        const alreadyHeld = lock !== null && !lock.released;
        if (stopped || alreadyHeld || document.visibilityState !== 'visible') {
          void sentinel.release();
          return;
        }
        lock = sentinel;
      })
      .catch(() => {});
  };

  requestWhenVisible();
  document.addEventListener('visibilitychange', requestWhenVisible);

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', requestWhenVisible);
    void lock?.release();
  };
}
