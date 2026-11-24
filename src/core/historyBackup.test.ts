import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from './history';
import { backupFileName, BackupError, historyBackup, parseHistoryBackup } from './historyBackup';
import { emptyRow } from './workout';

function entry(id: string): HistoryEntry {
  return {
    id,
    extraColumn: 'heartRate',
    workout: {
      startTime: new Date('2026-11-18T10:00:00Z'),
      splitDistance: 500,
      summary: { ...emptyRow(), distanceM: 2000, durationDs: 4500, heartRate: 160 },
      rows: [{ ...emptyRow(), distanceM: 500, durationDs: 1125, splitDs: 1125, rate: 28 }, { ...emptyRow(), isRest: true }],
      dragFactor: 120,
      name: '2k test',
      notes: 'Felt strong',
      feeling: 4,
      heartRates: [150, null, 165],
    },
  };
}

describe('history backup', () => {
  it('restores exactly the workouts it exported', () => {
    const entries = [entry('a'), entry('b')];
    const restored = parseHistoryBackup(historyBackup(entries, new Date('2026-11-24T10:00:00Z')));
    expect(restored).toEqual(entries);
    expect(restored[0]?.workout.startTime).toBeInstanceOf(Date);
  });

  it('leaves out the sync revision of saved workouts', () => {
    const text = historyBackup([{ ...entry('a'), revision: 'r1' } as HistoryEntry], new Date());
    expect(text).not.toContain('r1');
  });

  it('restores an empty history', () => {
    expect(parseHistoryBackup(historyBackup([], new Date()))).toEqual([]);
  });

  it.each([
    ['text that is not JSON', 'hello'],
    ['JSON null', 'null'],
    ['a bare array of workouts', JSON.stringify([entry('a')])],
    ['another format', JSON.stringify({ format: 'other', version: 1, workouts: [] })],
    ['a newer version', JSON.stringify({ format: 'ergscan-history', version: 2, workouts: [] })],
    ['a backup without workouts', JSON.stringify({ format: 'ergscan-history', version: 1 })],
  ])('rejects %s', (_, text) => {
    expect(() => parseHistoryBackup(text)).toThrow(BackupError);
  });

  it('rejects the whole file when one workout is unreadable', () => {
    const text = JSON.stringify({ format: 'ergscan-history', version: 1, workouts: [entry('a'), { id: 'b' }] });
    expect(() => parseHistoryBackup(text)).toThrow(BackupError);
  });

  it('names the file after the local export date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 30))).toBe('ergscan-history-20260105.json');
  });
});
