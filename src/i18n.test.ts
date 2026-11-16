import { describe, expect, it } from 'vitest';
import da from './locales/da/i18n.json';
import en from './locales/en/i18n.json';
import { pickLocale } from './i18n';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe('locales', () => {
  it('every locale has the same keys as English', () => {
    expect(keys(da).sort()).toEqual(keys(en).sort());
  });
});

describe('pickLocale', () => {
  it('matches on the base language', () => {
    expect(pickLocale(['da-DK', 'en-US'])).toBe('da');
  });

  it('falls back to English', () => {
    expect(pickLocale(['fr-FR'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });
});
