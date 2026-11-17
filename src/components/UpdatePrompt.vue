<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { watchForUpdates } from '../ui/swUpdate';

const { t } = useI18n();

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, registration) {
    if (registration) watchForUpdates(registration, document);
  },
});
</script>

<template>
  <Transition name="snackbar">
    <div v-if="needRefresh" class="snackbar" role="status">
      <span class="snackbar-text">{{ t('update.available') }}</span>
      <button type="button" class="snackbar-action" @click="needRefresh = false">{{ t('update.later') }}</button>
      <button type="button" class="snackbar-action" @click="updateServiceWorker()">{{ t('update.reload') }}</button>
    </div>
  </Transition>
</template>
