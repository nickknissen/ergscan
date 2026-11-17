import { describe, expect, it } from 'vitest';
import { keepExisting, nextSelection } from './selection';

const ids = ['a', 'b', 'c', 'd', 'e'];
const none = { selected: [], anchor: null };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };

describe('nextSelection', () => {
  it('toggles single items with Ctrl and keeps list order', () => {
    const one = nextSelection(none, ids, 'c', toggle);
    const two = nextSelection(one, ids, 'a', toggle);
    expect(two).toEqual({ selected: ['a', 'c'], anchor: 'a' });
    expect(nextSelection(two, ids, 'c', toggle).selected).toEqual(['a']);
  });

  it('selects the range from the anchor with Shift, in either direction', () => {
    const anchored = nextSelection(none, ids, 'b', toggle);
    expect(nextSelection(anchored, ids, 'd', range)).toEqual({ selected: ['b', 'c', 'd'], anchor: 'b' });
    const fromEnd = nextSelection(none, ids, 'e', toggle);
    expect(nextSelection(fromEnd, ids, 'c', range).selected).toEqual(['c', 'd', 'e']);
  });

  it('adds a range to the selection with Ctrl+Shift', () => {
    const current = { selected: ['a'], anchor: 'c' };
    expect(nextSelection(current, ids, 'd', { toggle: true, range: true }).selected).toEqual(['a', 'c', 'd']);
  });

  it('starts a selection with Shift when there is no anchor yet', () => {
    expect(nextSelection(none, ids, 'b', range)).toEqual({ selected: ['b'], anchor: 'b' });
  });

  it('clears on a plain click', () => {
    expect(nextSelection({ selected: ['a', 'b'], anchor: 'a' }, ids, 'c', { toggle: false, range: false })).toEqual(none);
  });
});

describe('keepExisting', () => {
  it('drops deleted entries from the selection and the anchor', () => {
    expect(keepExisting({ selected: ['a', 'x'], anchor: 'x' }, ids)).toEqual({ selected: ['a'], anchor: null });
  });
});
