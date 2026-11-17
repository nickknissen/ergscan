import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

describe('ICONS', () => {
  it('holds bare path markup for both outlined and filled styles', () => {
    for (const [name, styles] of Object.entries(ICONS)) {
      for (const markup of styles) {
        expect(markup, name).toMatch(/^<path d="[^"]+"\/>$/);
      }
    }
  });
});
