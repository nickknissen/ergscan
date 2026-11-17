import { describe, expect, it } from 'vitest';
import { fabCollapsed, screenTransition } from './transitions';

describe('screenTransition', () => {
  it('fades through between top-level destinations', () => {
    expect(screenTransition('capture', 'history')).toBe('fade-through');
    expect(screenTransition('settings', 'capture')).toBe('fade-through');
    expect(screenTransition('capture', 'guide')).toBe('fade-through');
  });

  it('slides forward into a workout and back out of it', () => {
    expect(screenTransition('capture', 'scanning')).toBe('axis-forward');
    expect(screenTransition('camera', 'scanning')).toBe('axis-forward');
    expect(screenTransition('history', 'review')).toBe('axis-forward');
    expect(screenTransition('review', 'history')).toBe('axis-back');
  });

  it('fades through from scanning to its results', () => {
    expect(screenTransition('scanning', 'review')).toBe('fade-through');
  });
});

describe('fabCollapsed', () => {
  it('collapses while scrolling down and extends while scrolling up', () => {
    expect(fabCollapsed(0, 40, false)).toBe(true);
    expect(fabCollapsed(40, 20, true)).toBe(false);
  });

  it('is always extended at the top', () => {
    expect(fabCollapsed(40, 0, true)).toBe(false);
  });

  it('keeps its state when the position does not change', () => {
    expect(fabCollapsed(40, 40, true)).toBe(true);
    expect(fabCollapsed(40, 40, false)).toBe(false);
  });
});
