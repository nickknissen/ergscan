import { describe, expect, it } from 'vitest';
import en from '../locales/en/i18n.json';
import { SyncError, syncFailureStatus } from './client';

describe('syncFailureStatus', () => {
  it.each([
    [401, 'unlinked'],
    [413, 'tooLarge'],
    [429, 'serverBusy'],
    [507, 'serverBusy'],
    [500, 'failed'],
    [412, 'failed'],
  ])('shows a %i response as %s', (status, expected) => {
    expect(syncFailureStatus(new SyncError(status))).toBe(expected);
  });

  it('shows errors without a response as failed', () => {
    expect(syncFailureStatus(new TypeError('Failed to fetch'))).toBe('failed');
  });

  it('has text for every status it reports', () => {
    for (const status of [401, 413, 429, 507, 500]) {
      expect(en.sync.state).toHaveProperty(syncFailureStatus(new SyncError(status)));
    }
  });
});
