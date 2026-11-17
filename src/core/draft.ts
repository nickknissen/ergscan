import { parseEntry, type HistoryEntry, type HistoryStorage } from './history';

export interface Draft extends HistoryEntry {
  savedKey: string | null;
  origin: 'capture' | 'history';
  rawText: string;
  notice: string;
  computedSummary: boolean;
}

export type DraftStorage = HistoryStorage & Pick<Storage, 'removeItem'>;

export const DRAFT_KEY = 'ergscan.draft';

export function saveDraft(storage: DraftStorage, draft: Draft) {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    storage.removeItem(DRAFT_KEY);
  }
}

export function clearDraft(storage: DraftStorage) {
  storage.removeItem(DRAFT_KEY);
}

export function loadDraft(storage: DraftStorage, id: string | null): Draft | null {
  let parsed: Partial<Draft>;
  try {
    parsed = JSON.parse(storage.getItem(DRAFT_KEY) ?? 'null') as Partial<Draft>;
  } catch {
    return null;
  }
  const entry = parseEntry(parsed);
  if (!entry) return null;
  const savedKey = typeof parsed.savedKey === 'string' ? parsed.savedKey : null;
  if (id === null ? savedKey !== null : savedKey === null || entry.id !== id) return null;
  return {
    ...entry,
    savedKey,
    origin: parsed.origin === 'history' ? 'history' : 'capture',
    rawText: typeof parsed.rawText === 'string' ? parsed.rawText : '',
    notice: typeof parsed.notice === 'string' ? parsed.notice : '',
    computedSummary: parsed.computedSummary === true,
  };
}
