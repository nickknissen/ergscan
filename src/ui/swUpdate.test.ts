import { describe, expect, it, vi } from 'vitest';
import { watchForUpdates } from './swUpdate';

function fakeDocument() {
  const target = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  target.visibilityState = 'visible';
  return target;
}

function setup(update = vi.fn(() => Promise.resolve())) {
  const doc = fakeDocument();
  let tick: (() => void) | undefined;
  const timers = { setInterval: vi.fn((handler: () => void) => (tick = handler)) };
  watchForUpdates({ update }, doc as unknown as Document, timers, 1000);
  return { doc, update, timers, tick: () => tick?.() };
}

describe('watchForUpdates', () => {
  it('checks for an update on every interval tick', () => {
    const { update, timers, tick } = setup();
    expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    tick();
    tick();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('checks when the app becomes visible again', () => {
    const { doc, update } = setup();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('ignores a failed check, for example while offline', async () => {
    const update = vi.fn(() => Promise.reject(new Error('offline')));
    const { tick } = setup(update);
    tick();
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
