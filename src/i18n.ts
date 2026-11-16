import { createI18n } from 'vue-i18n';
import da from './locales/da/i18n.json';
import en from './locales/en/i18n.json';

type Schema = typeof en;

const messages: Record<string, Schema> = { en, da };

export function pickLocale(languages: readonly string[]): string {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0] ?? '';
    if (base in messages) return base;
  }
  return 'en';
}

export const i18n = createI18n<[Schema], string, false>({
  legacy: false,
  locale: pickLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
  fallbackLocale: 'en',
  messages,
});
