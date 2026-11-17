export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'ergscan.theme';
const APP_PREFIX = 'ergscan.';
const THEME_COLORS = { light: '#f9f9ff', dark: '#111318' } as const;

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

export function applyTheme(doc: Document, theme: Theme): void {
  doc.documentElement.style.colorScheme = theme === 'system' ? '' : theme;
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = theme === 'system' ? (meta.media.includes('dark') ? 'dark' : 'light') : theme;
    meta.content = THEME_COLORS[scheme];
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
