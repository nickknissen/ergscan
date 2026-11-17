import { describe, expect, it } from 'vitest';
import { cameraFailure } from './cameraFailure';

describe('cameraFailure', () => {
  it.each([
    ['NotAllowedError', 'camera.denied'],
    ['SecurityError', 'camera.denied'],
    ['NotFoundError', 'camera.missing'],
    ['OverconstrainedError', 'camera.missing'],
    ['NotReadableError', 'camera.busy'],
    ['AbortError', 'camera.failed'],
  ])('maps %s to %s', (name, key) => {
    expect(cameraFailure(new DOMException('boom', name)).key).toBe(key);
  });

  it('keeps the original message for unknown errors', () => {
    expect(cameraFailure(new Error('no luck'))).toEqual({ key: 'camera.failed', message: 'no luck' });
    expect(cameraFailure('weird')).toEqual({ key: 'camera.failed', message: 'weird' });
  });
});
