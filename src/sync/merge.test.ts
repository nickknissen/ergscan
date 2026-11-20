import { describe, expect, it } from 'vitest';
import { emptyRow } from '../core/workout';
import { emptySnapshot, merge, parseSnapshot, type Change } from './merge';

function saved(sequence: number, revision: string, base: string | null = null): Change {
  return {
    sequence, id: 'workout', revision, base,
    entry: {
      id: 'workout', extraColumn: 'heartRate',
      workout: {
        startTime: new Date('2026-11-18T13:00:00Z'), splitDistance: 500, summary: emptyRow(), rows: [],
        dragFactor: null, name: revision, notes: null, feeling: null, heartRates: null,
      },
    },
  };
}

describe('sync merge', () => {
  it('acknowledges already-applied operations without modifying newer records', () => {
    const initial = merge(emptySnapshot(), 'phone', [saved(1, 'first')]);
    const updated = merge(initial, 'desktop', [saved(1, 'second', 'first')]);
    expect(merge(updated, 'phone', [saved(1, 'first')])).toEqual(updated);
  });

  it('preserves a series of offline edits on one stable conflict copy', () => {
    const initial = merge(emptySnapshot(), 'phone', [saved(1, 'first'), saved(2, 'second', 'first')]);
    const conflicting = merge(initial, 'desktop', [saved(1, 'offline', 'first'), saved(2, 'another edit', 'offline')]);
    expect(conflicting.records.map(({ id, revision, entry }) => [id, revision, entry?.id])).toEqual([
      ['workout', 'second', 'workout'], ['workout~offline', 'another edit', 'workout~offline'],
    ]);
    expect(parseSnapshot(JSON.parse(JSON.stringify(conflicting)))).toEqual(conflicting);
  });

  it('keeps a deletion after a stale device reconnects', () => {
    const initial = merge(emptySnapshot(), 'phone', [saved(1, 'first')]);
    const deleted = merge(initial, 'phone', [{ ...saved(2, 'deleted', 'first'), entry: null }]);
    const stale = merge(deleted, 'desktop', [saved(1, 'offline', 'first')]);
    expect(stale.records).toEqual(deleted.records);
    expect(stale.applied).toContainEqual(['desktop', 1]);
  });
});
