import { describe, expect, it } from 'vitest';
import { nextOptionIndex, placeMenu } from './menu';

describe('nextOptionIndex', () => {
  it('moves and wraps with the arrow keys', () => {
    expect(nextOptionIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextOptionIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(nextOptionIndex(0, 'ArrowUp', 3)).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(nextOptionIndex(1, 'Home', 3)).toBe(0);
    expect(nextOptionIndex(1, 'End', 3)).toBe(2);
  });

  it('ignores other keys and empty menus', () => {
    expect(nextOptionIndex(1, 'a', 3)).toBeNull();
    expect(nextOptionIndex(0, 'ArrowDown', 0)).toBeNull();
  });
});

describe('placeMenu', () => {
  const viewport = { width: 400, height: 800 };
  const menu = { width: 160, height: 200 };

  it('opens below the anchor, aligned to its right edge', () => {
    const anchor = { left: 250, right: 380, top: 100, bottom: 140 };
    expect(placeMenu(anchor, menu, viewport)).toEqual({ left: 220, top: 144, above: false });
  });

  it('opens above when there is no room below', () => {
    const anchor = { left: 250, right: 380, top: 700, bottom: 740 };
    expect(placeMenu(anchor, menu, viewport)).toEqual({ left: 220, top: 496, above: true });
  });

  it('stays inside the viewport margins', () => {
    const anchor = { left: 0, right: 100, top: 100, bottom: 140 };
    expect(placeMenu(anchor, menu, viewport).left).toBe(8);
    const wide = { left: 300, right: 420, top: 100, bottom: 140 };
    expect(placeMenu(wide, menu, viewport).left).toBe(232);
  });
});
