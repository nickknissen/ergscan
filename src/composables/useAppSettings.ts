import { computed, ref, watch } from 'vue';
import type { Accent } from 'm3-vue/ui/palette';
import {
  applyTheme,
  LIST_WIDTH,
  loadAccent,
  loadHeartRate,
  loadIntroHidden,
  loadListPane,
  loadTheme,
  maxHeartRate,
  saveAccent,
  saveHeartRate,
  saveIntroHidden,
  saveListPane,
  saveTheme,
  type HeartRateSettings,
  type ListPane,
  type Theme,
} from '../core/settings';

/** User preferences, loaded from and saved back to storage as they change. */
export function useAppSettings(storage: Storage | null) {
  const theme = ref<Theme>(loadTheme(storage));
  const accent = ref<Accent>(loadAccent(storage));

  watch(theme, (value) => {
    if (storage) saveTheme(storage, value);
    applyTheme(document, value, accent.value);
  });

  watch(accent, (value) => {
    if (storage) saveAccent(storage, value);
    applyTheme(document, theme.value, value);
  });

  const introHidden = ref(loadIntroHidden(storage));
  const showIntro = computed({
    get: () => !introHidden.value,
    set: (value: boolean) => {
      introHidden.value = !value;
      if (storage) saveIntroHidden(storage, !value);
    },
  });

  const heartRate = ref<HeartRateSettings>(loadHeartRate(storage));
  const maxHr = computed(() => maxHeartRate(heartRate.value));
  watch(heartRate, (value) => {
    if (storage) saveHeartRate(storage, value);
  });

  const listPane = ref<ListPane>(loadListPane(storage));
  watch(listPane, (value) => storage && saveListPane(storage, value));

  /** Back to defaults after the app data has been cleared. */
  function reset() {
    theme.value = 'system';
    accent.value = 'default';
    introHidden.value = false;
    heartRate.value = { measuredMax: null, age: null };
    listPane.value = { width: LIST_WIDTH.initial, collapsed: false };
  }

  return { theme, accent, showIntro, heartRate, maxHr, listPane, reset };
}
