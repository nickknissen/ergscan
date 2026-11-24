import { ref } from 'vue';
import { backupFileName, historyBackup, MAX_BACKUP_BYTES, parseHistoryBackup } from '../core/historyBackup';
import type { HistoryEntry } from '../core/history';
import { persistStorage } from '../ui/persistentStorage';
import { saveFile } from '../ui/saveFile';
import type { useHistorySync } from './useHistorySync';

/**
 * Exporting the saved workouts to a file and restoring them from one, so history outlives the
 * browser's storage. `message` is what the settings screen shows about the last export or restore.
 */
export function useHistoryBackup(options: {
  historySync: Pick<ReturnType<typeof useHistorySync>, 'repository' | 'history' | 'readyHistory' | 'storageError' | 'syncNow'>;
  t: { (key: string, plural: number): string; (key: string, named?: Record<string, unknown>): string };
}) {
  const { historySync: { repository, history, readyHistory, storageError, syncNow }, t } = options;
  const message = ref<{ error: boolean; text: string } | null>(null);

  async function exportHistory() {
    message.value = null;
    const entries: HistoryEntry[] = history.value.map(({ id, workout, extraColumn }) => ({ id, workout, extraColumn }));
    if (!entries.length) return;
    const now = new Date();
    const file = new File([historyBackup(entries, now)], backupFileName(now), { type: 'application/json' });
    const name = await saveFile(file, { description: t('settings.backupFileType'), extension: '.json' });
    if (name !== null) message.value = { error: false, text: t('settings.exported', { name }) };
  }

  async function restoreHistory(file: File) {
    message.value = null;
    let entries: HistoryEntry[];
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Too large');
      entries = parseHistoryBackup(await file.text());
    } catch {
      message.value = { error: true, text: t('settings.restoreInvalid') };
      return;
    }
    let added: number;
    try {
      await readyHistory;
      added = await repository.restore(entries);
      storageError.value = false;
    } catch {
      storageError.value = true;
      return;
    }
    const skipped = entries.length - added;
    const text = [t('settings.restored', added), skipped ? t('settings.restoreSkipped', skipped) : ''].filter(Boolean).join(' ');
    message.value = { error: false, text };
    if (added) {
      void persistStorage();
      void syncNow();
    }
  }

  return { message, exportHistory, restoreHistory };
}
