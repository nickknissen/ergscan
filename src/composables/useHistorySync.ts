import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { HISTORY_KEY } from '../core/history';
import { syncFailureStatus, syncHistory } from '../sync/client';
import { historyStore, workouts, type Device, type SavedWorkout } from '../sync/store';

/**
 * Saved workout history and, when enabled, keeping it in sync with linked
 * devices while the app is open.
 */
export function useHistorySync(storage: Storage | null, syncEnabled: boolean) {
  const repository = historyStore(storage);
  const history = shallowRef<SavedWorkout[]>([]);
  const linkedDevice = shallowRef<Device | null>(null);
  const pendingSync = ref(0);
  const syncStatus = ref('waiting');
  const storageError = ref(false);
  let refreshSequence = 0;
  let syncing = false;

  async function refreshHistory() {
    const sequence = ++refreshSequence;
    const state = await repository.read();
    if (sequence !== refreshSequence) return;
    history.value = workouts(state);
    if (linkedDevice.value?.token !== state.device?.token) syncStatus.value = 'waiting';
    linkedDevice.value = state.device;
    pendingSync.value = state.pending.length;
  }

  const readyHistory = repository.initialize().then(refreshHistory).catch(() => { storageError.value = true; });
  const unsubscribeHistory = repository.subscribe(() => {
    void refreshHistory().catch(() => { storageError.value = true; });
  });

  async function syncNow() {
    if (!syncEnabled || syncing) return;
    syncing = true;
    try {
      await readyHistory;
      const { device } = await repository.read();
      if (!device) return;
      if (!navigator.onLine) {
        syncStatus.value = 'offline';
        return;
      }
      syncStatus.value = 'syncing';
      try {
        await syncHistory(repository);
        const current = await repository.read();
        if (current.device?.token === device.token) syncStatus.value = current.pending.length ? 'waiting' : 'synced';
      } catch (error) {
        if ((await repository.read()).device?.token !== device.token) return;
        syncStatus.value = syncFailureStatus(error);
      }
    } catch {
      storageError.value = true;
    } finally {
      syncing = false;
    }
  }

  function migrateLegacyWrite(event: StorageEvent) {
    if (event.key === HISTORY_KEY && event.newValue !== null) {
      void repository.initialize().then(syncNow).catch(() => { storageError.value = true; });
    }
  }

  function syncWhileVisible() {
    if (document.visibilityState === 'visible') void syncNow();
  }

  let syncTimer: number | undefined;
  onMounted(() => {
    void syncNow();
    window.addEventListener('online', syncNow);
    window.addEventListener('storage', migrateLegacyWrite);
    window.addEventListener('offline', syncNow);
    document.addEventListener('visibilitychange', syncWhileVisible);
    syncTimer = window.setInterval(() => {
      if (linkedDevice.value && syncStatus.value !== 'unlinked') syncWhileVisible();
    }, 15_000);
  });
  onBeforeUnmount(() => {
    unsubscribeHistory();
    window.clearInterval(syncTimer);
    window.removeEventListener('online', syncNow);
    window.removeEventListener('storage', migrateLegacyWrite);
    window.removeEventListener('offline', syncNow);
    document.removeEventListener('visibilitychange', syncWhileVisible);
  });

  return { repository, history, linkedDevice, pendingSync, syncStatus, storageError, readyHistory, refreshHistory, syncNow };
}
