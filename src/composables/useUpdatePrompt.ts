import { snackbar } from '@nickknissen/m3-vue/ui/snackbar';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { watchForUpdates } from '../ui/swUpdate';

/**
 * When a new version has been downloaded, a snackbar says so until Reload is tapped. There's no
 * Later: the new version takes over by itself the next time the app opens.
 */
export function useUpdatePrompt() {
  const { t } = useI18n();
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) watchForUpdates(registration, document);
    },
  });

  watch(needRefresh, async (waiting) => {
    if (!waiting) return;
    const how = await snackbar(t('update.available'), { action: t('update.reload'), duration: Infinity });
    if (how === 'action') void updateServiceWorker();
  });
}
