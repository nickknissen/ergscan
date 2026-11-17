import { describe, expect, it } from 'vitest';
import { clearAppData, HIDE_INTRO_KEY, loadIntroHidden, loadTheme, saveIntroHidden, saveTheme, THEME_KEY } from './settings';

function memoryStorage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('theme', () => {
  it('defaults to system when nothing or something unknown is stored', () => {
    expect(loadTheme(memoryStorage())).toBe('system');
    expect(loadTheme(memoryStorage({ [THEME_KEY]: 'sepia' }))).toBe('system');
    expect(loadTheme(null)).toBe('system');
  });

  it('round-trips light and dark', () => {
    const storage = memoryStorage();
    saveTheme(storage, 'dark');
    expect(loadTheme(storage)).toBe('dark');
    saveTheme(storage, 'light');
    expect(loadTheme(storage)).toBe('light');
  });

  it('removes the stored value when going back to system', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'dark' });
    saveTheme(storage, 'system');
    expect(storage.data.has(THEME_KEY)).toBe(false);
  });
});

describe('intro visibility', () => {
  it('shows the intro unless it was hidden', () => {
    expect(loadIntroHidden(memoryStorage())).toBe(false);
    expect(loadIntroHidden(null)).toBe(false);
  });

  it('remembers hiding and clears the key when shown again', () => {
    const storage = memoryStorage();
    saveIntroHidden(storage, true);
    expect(loadIntroHidden(storage)).toBe(true);
    saveIntroHidden(storage, false);
    expect(storage.data.has(HIDE_INTRO_KEY)).toBe(false);
  });
});

describe('clearAppData', () => {
  it('removes every ErgScan key and leaves other keys alone', () => {
    const storage = memoryStorage({
      'ergscan.history': '[]',
      'ergscan.guideSeen': '1',
      [THEME_KEY]: 'dark',
      'other.app': 'keep',
    });
    clearAppData(storage);
    expect([...storage.data.keys()]).toEqual(['other.app']);
  });
});
