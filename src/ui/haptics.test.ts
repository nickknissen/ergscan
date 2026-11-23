import { afterEach, describe, expect, it, vi } from 'vitest';
import { buzz } from './haptics';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a buzz on a phone that can vibrate', () => {
  it('gives a quick tap when the camera takes its photo', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    buzz('shutter');

    expect(vibrate).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it('gives the lightest tick when a pinch crosses a zoom chip', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    buzz('zoomStop');

    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it.each([
    { moment: 'read', when: 'a photo is read' },
    { moment: 'saved', when: 'a workout is saved' },
  ] as const)('gives a double buzz when $when', ({ moment }) => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    buzz(moment);

    expect(vibrate).toHaveBeenCalledWith([20, 40, 20]);
  });

  it('gives three pulses when a photo could not be read', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    buzz('unread');

    expect(vibrate).toHaveBeenCalledWith([40, 60, 40, 60, 40]);
  });
});

/** A document whose throwaway switches only count how often they're flipped, as an iPhone ticks once per flip. */
function iphoneDocument(): { document: unknown; flips: () => number } {
  let flipCount = 0;
  const element = () => ({
    style: {},
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
    click: () => flipCount++,
  });

  return {
    document: { createElement: element, body: { appendChild: vi.fn() } },
    flips: () => flipCount,
  };
}

describe('a buzz on an iPhone, which ticks instead of vibrating', () => {
  it('ticks once when the camera takes its photo', () => {
    vi.useFakeTimers();
    const iphone = iphoneDocument();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', iphone.document);

    buzz('shutter');
    vi.runAllTimers();

    expect(iphone.flips()).toBe(1);
  });

  it('ticks twice, one pulse apart, when a workout is saved', () => {
    vi.useFakeTimers();
    const iphone = iphoneDocument();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', iphone.document);

    buzz('saved');
    vi.advanceTimersByTime(0);
    expect(iphone.flips()).toBe(1);

    vi.advanceTimersByTime(60);
    expect(iphone.flips()).toBe(2);
  });

  it('ticks three times when a photo could not be read', () => {
    vi.useFakeTimers();
    const iphone = iphoneDocument();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', iphone.document);

    buzz('unread');
    vi.runAllTimers();

    expect(iphone.flips()).toBe(3);
  });
});

describe('a buzz where nothing can vibrate', () => {
  it('does nothing without vibration when there is no page to flip a switch on', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', undefined);

    expect(() => buzz('shutter')).not.toThrow();
  });

  it('does nothing outside a browser', () => {
    vi.stubGlobal('navigator', undefined);

    expect(() => buzz('shutter')).not.toThrow();
  });
});
