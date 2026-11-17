import { describe, expect, it } from 'vitest';
import { scanFailure } from './scanFailure';

describe('scanFailure', () => {
  it('explains that the text reader needs a connection when offline', () => {
    expect(scanFailure(new TypeError('Failed to fetch'), false)).toEqual({ key: 'scan.offline', message: 'Failed to fetch' });
  });

  it('passes the error through when online', () => {
    expect(scanFailure(new Error('boom'), true)).toEqual({ key: 'scan.error', message: 'boom' });
    expect(scanFailure('odd', true)).toEqual({ key: 'scan.error', message: 'odd' });
  });
});
