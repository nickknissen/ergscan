import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdScreenWakeLock } from './screenWakeLock';

/** A document that can be hidden and shown, as switching apps or locking the phone does. */
class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

/** A lock the browser handed out. The browser also drops it by itself when the page is hidden. */
class FakeSentinel {
  released = false;

  async release(): Promise<void> {
    this.released = true;
  }
}

/** Lets pending lock requests resolve. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let fakeDocument: FakeDocument;
let sentinels: FakeSentinel[];
let request: ReturnType<typeof vi.fn>;

/** Holds the next lock request open, as a slow browser does, and returns the function that grants it. */
function delayNextLock(): () => void {
  let grant: (sentinel: FakeSentinel) => void = () => {};
  request.mockImplementationOnce(
    () =>
      new Promise<FakeSentinel>((resolve) => {
        grant = resolve;
      }),
  );

  return () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    grant(sentinel);
  };
}

beforeEach(() => {
  fakeDocument = new FakeDocument();
  sentinels = [];
  request = vi.fn(async () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  fakeDocument.addEventListener('visibilitychange', () => {
    if (fakeDocument.visibilityState === 'hidden') sentinels.forEach((sentinel) => void sentinel.release());
  });
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('navigator', { wakeLock: { request } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('holding the screen awake', () => {
  it('asks for a screen lock straight away on a page that is on screen', () => {
    holdScreenWakeLock();

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('waits for a hidden page to come back before asking', () => {
    fakeDocument.visibilityState = 'hidden';
    holdScreenWakeLock();

    expect(request).not.toHaveBeenCalled();

    fakeDocument.setVisibility('visible');

    expect(request).toHaveBeenCalledOnce();
  });

  it('asks again each time the page comes back, as the browser dropped the lock when it was hidden', async () => {
    holdScreenWakeLock();
    await settle();

    fakeDocument.setVisibility('hidden');
    fakeDocument.setVisibility('visible');
    await settle();
    fakeDocument.setVisibility('hidden');
    fakeDocument.setVisibility('visible');

    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('letting the screen sleep again', () => {
  it('releases the lock it holds', async () => {
    const stop = holdScreenWakeLock();
    await settle();

    stop();

    expect(sentinels.map((sentinel) => sentinel.released)).toEqual([true]);
  });

  it('no longer asks when the page comes back', async () => {
    const stop = holdScreenWakeLock();
    await settle();
    stop();

    fakeDocument.setVisibility('hidden');
    fakeDocument.setVisibility('visible');

    expect(request).toHaveBeenCalledOnce();
  });

  it('releases a lock that only arrives after it stopped being wanted', async () => {
    const grantLock = delayNextLock();
    const stop = holdScreenWakeLock();

    stop();
    grantLock();
    await settle();

    expect(sentinels.map((sentinel) => sentinel.released)).toEqual([true]);
  });

  it('releases a lock that only arrives after the page was hidden', async () => {
    const grantLock = delayNextLock();
    holdScreenWakeLock();

    fakeDocument.setVisibility('hidden');
    grantLock();
    await settle();

    expect(sentinels.map((sentinel) => sentinel.released)).toEqual([true]);
  });

  it('keeps no stray lock when a slow one arrives after the page came back with a fresh one', async () => {
    const grantLock = delayNextLock();
    const stop = holdScreenWakeLock();
    fakeDocument.setVisibility('hidden');
    fakeDocument.setVisibility('visible');
    await settle();

    grantLock();
    await settle();
    stop();

    expect(sentinels).toHaveLength(2);
    expect(sentinels.every((sentinel) => sentinel.released)).toBe(true);
  });
});

describe('a browser that cannot keep the screen awake', () => {
  it('does nothing where there is no wake lock, like an iPhone before iOS 16.4', () => {
    vi.stubGlobal('navigator', {});

    expect(() => {
      const stop = holdScreenWakeLock();
      fakeDocument.setVisibility('hidden');
      fakeDocument.setVisibility('visible');
      stop();
    }).not.toThrow();
  });

  it('gives up quietly when the browser refuses, as battery saver does', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    request.mockRejectedValue(new DOMException('Battery saver is on', 'NotAllowedError'));

    const stop = holdScreenWakeLock();
    await settle();
    stop();

    expect(request).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
