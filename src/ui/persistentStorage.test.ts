import { describe, expect, it, vi } from 'vitest';
import { persistStorage } from './persistentStorage';

describe('persistStorage', () => {
  it('does not ask again once storage is persistent', async () => {
    const storage = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) };
    expect(await persistStorage(storage)).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('asks when storage is not yet persistent and reports the answer', async () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => false) };
    expect(await persistStorage(storage)).toBe(false);
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it('reports false where the browser has no storage manager or it fails', async () => {
    expect(await persistStorage(undefined)).toBe(false);
    expect(await persistStorage({} as never)).toBe(false);
    const failing = { persisted: async () => { throw new Error('denied'); }, persist: async () => true };
    expect(await persistStorage(failing)).toBe(false);
  });
});
