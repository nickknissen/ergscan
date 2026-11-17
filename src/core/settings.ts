import { ACCENTS, accentPalette, paletteProperties, TOKEN_PROPERTIES, type Accent } from './palette';

export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'ergscan.theme';
export const ACCENT_KEY = 'ergscan.accent';
const APP_PREFIX = 'ergscan.';
const THEME_COLORS = { light: '#f9f9ff', dark: '#111318' } as const;

export function loadAccent(storage: Pick<Storage, 'getItem'> | null): Accent {
  const value = storage?.getItem(ACCENT_KEY);
  return ACCENTS.includes(value as Accent) ? (value as Accent) : 'default';
}

export function saveAccent(storage: Pick<Storage, 'setItem' | 'removeItem'>, accent: Accent): void {
  try {
    if (accent === 'default') storage.removeItem(ACCENT_KEY);
    else storage.setItem(ACCENT_KEY, accent);
  } catch {
    // Storage full or blocked: the color still applies for this session.
  }
}

export function loadTheme(storage: Pick<Storage, 'getItem'> | null): Theme {
  const value = storage?.getItem(THEME_KEY);
  return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
}

export function saveTheme(storage: Pick<Storage, 'setItem' | 'removeItem'>, theme: Theme): void {
  try {
    if (theme === 'system') storage.removeItem(THEME_KEY);
    else storage.setItem(THEME_KEY, theme);
  } catch {
    // Storage full or blocked: the theme still applies for this session.
  }
}

export const HIDE_INTRO_KEY = 'ergscan.hideIntro';

export function loadIntroHidden(storage: Pick<Storage, 'getItem'> | null): boolean {
  return storage?.getItem(HIDE_INTRO_KEY) === '1';
}

export function saveIntroHidden(storage: Pick<Storage, 'setItem' | 'removeItem'>, hidden: boolean): void {
  try {
    if (hidden) storage.setItem(HIDE_INTRO_KEY, '1');
    else storage.removeItem(HIDE_INTRO_KEY);
  } catch {
    // Storage full or blocked: the choice still applies for this session.
  }
}

export const MAX_HR_KEY = 'ergscan.maxHr';
export const AGE_KEY = 'ergscan.age';

export interface HeartRateSettings {
  measuredMax: number | null;
  age: number | null;
}

export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : null;
}

function loadWholeNumber(storage: Pick<Storage, 'getItem'> | null, key: string): number | null {
  return parseWholeNumber(storage?.getItem(key) ?? '');
}

export function loadHeartRate(storage: Pick<Storage, 'getItem'> | null): HeartRateSettings {
  return { measuredMax: loadWholeNumber(storage, MAX_HR_KEY), age: loadWholeNumber(storage, AGE_KEY) };
}

export function saveHeartRate(storage: Pick<Storage, 'setItem' | 'removeItem'>, settings: HeartRateSettings): void {
  try {
    for (const [key, value] of [
      [MAX_HR_KEY, settings.measuredMax],
      [AGE_KEY, settings.age],
    ] as const) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, String(value));
    }
  } catch {
    // Storage full or blocked: the values still apply for this session.
  }
}

export function maxHeartRate(settings: HeartRateSettings): number | null {
  if (settings.measuredMax !== null) return settings.measuredMax;
  return settings.age === null ? null : estimatedMaxHeartRate(settings.age);
}

export function estimatedMaxHeartRate(age: number): number | null {
  return age >= 220 ? null : 220 - age;
}

export function applyTheme(doc: Document, theme: Theme, accent: Accent = 'default'): void {
  const style = doc.documentElement.style;
  const palette = accentPalette(accent);
  style.colorScheme = theme === 'system' ? '' : theme;
  for (const property of TOKEN_PROPERTIES) style.removeProperty(property);
  if (palette) for (const [property, value] of paletteProperties(palette)) style.setProperty(property, value);
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = theme === 'system' ? (meta.media.includes('dark') ? 'dark' : 'light') : theme;
    meta.content = palette ? palette[scheme].surface : THEME_COLORS[scheme];
  }
}

export function clearAppData(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(APP_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
