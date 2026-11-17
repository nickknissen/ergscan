import { describe, expect, it } from 'vitest';
import { accentPalette } from './palette';
import {
  ACCENT_KEY,
  AGE_KEY,
  applyTheme,
  clearAppData,
  estimatedMaxHeartRate,
  HIDE_INTRO_KEY,
  loadAccent,
  loadHeartRate,
  loadIntroHidden,
  loadTheme,
  MAX_HR_KEY,
  maxHeartRate,
  parseWholeNumber,
  saveAccent,
  saveHeartRate,
  saveIntroHidden,
  saveTheme,
  THEME_KEY,
} from './settings';

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

describe('accent', () => {
  it('defaults when nothing or something unknown is stored', () => {
    expect(loadAccent(memoryStorage())).toBe('default');
    expect(loadAccent(memoryStorage({ [ACCENT_KEY]: 'chartreuse' }))).toBe('default');
    expect(loadAccent(null)).toBe('default');
  });

  it('round-trips a color and clears the key for default', () => {
    const storage = memoryStorage();
    saveAccent(storage, 'teal');
    expect(loadAccent(storage)).toBe('teal');
    saveAccent(storage, 'default');
    expect(storage.data.has(ACCENT_KEY)).toBe(false);
  });
});

function fakeDocument() {
  const properties = new Map<string, string>();
  const metas = [
    { media: '(prefers-color-scheme: dark)', content: '' },
    { media: '(prefers-color-scheme: light)', content: '' },
  ];
  const style = {
    setProperty: (name: string, value: string) => void properties.set(name, value),
    removeProperty: (name: string) => void properties.delete(name),
  };
  const dataset: Record<string, string> = {};
  const doc = { documentElement: { style, dataset }, querySelectorAll: () => metas } as unknown as Document;
  return { doc, properties, metas, dataset };
}

describe('applyTheme', () => {
  it('overrides the color tokens and theme-color for a generated accent', () => {
    const { doc, properties, metas } = fakeDocument();
    applyTheme(doc, 'system', 'teal');
    const palette = accentPalette('teal')!;
    expect(properties.get('--primary')).toBe(`light-dark(${palette.light.primary}, ${palette.dark.primary})`);
    expect(metas.map((m) => m.content)).toEqual([palette.dark.surface, palette.light.surface]);
  });

  it('drops the overrides when going back to default', () => {
    const { doc, properties, metas, dataset } = fakeDocument();
    applyTheme(doc, 'dark', 'red');
    applyTheme(doc, 'dark');
    expect(properties.size).toBe(0);
    expect(dataset.theme).toBe('dark');
    expect(metas.map((m) => m.content)).toEqual(['#111318', '#111318']);
  });

  it('picks the scheme with a data attribute so the lowered light-dark() in the build follows it', () => {
    const { doc, dataset } = fakeDocument();
    applyTheme(doc, 'light');
    expect(dataset.theme).toBe('light');
    applyTheme(doc, 'system');
    expect('theme' in dataset).toBe(false);
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

describe('heart rate', () => {
  it('has neither max HR nor age by default or when stored values are not whole numbers', () => {
    expect(loadHeartRate(memoryStorage())).toEqual({ measuredMax: null, age: null });
    expect(loadHeartRate(memoryStorage({ [MAX_HR_KEY]: 'fast', [AGE_KEY]: '-3' }))).toEqual({ measuredMax: null, age: null });
    expect(loadHeartRate(null)).toEqual({ measuredMax: null, age: null });
  });

  it('round-trips both values and clears the keys when emptied', () => {
    const storage = memoryStorage();
    saveHeartRate(storage, { measuredMax: 192, age: 40 });
    expect(loadHeartRate(storage)).toEqual({ measuredMax: 192, age: 40 });
    saveHeartRate(storage, { measuredMax: null, age: null });
    expect(storage.data.size).toBe(0);
  });

  it('estimates max HR as 220 minus age', () => {
    expect(maxHeartRate({ measuredMax: null, age: 40 })).toBe(180);
    expect(estimatedMaxHeartRate(40)).toBe(180);
  });

  it('accepts only positive whole numbers as input', () => {
    expect(parseWholeNumber(' 185 ')).toBe(185);
    expect(parseWholeNumber('0')).toBeNull();
    expect(parseWholeNumber('18.5')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
  });

  it('prefers a measured max HR over the age estimate', () => {
    expect(maxHeartRate({ measuredMax: 195, age: 40 })).toBe(195);
  });

  it('has no max HR when nothing is given', () => {
    expect(maxHeartRate({ measuredMax: null, age: null })).toBeNull();
    expect(maxHeartRate({ measuredMax: null, age: 220 })).toBeNull();
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
