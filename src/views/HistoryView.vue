<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import HistoryList from '../components/HistoryList.vue';
import MdIcon from '../components/MdIcon.vue';
import type { HistoryEntry } from '../core/history';

/** `paneShown`: the list sits in the side pane, so this screen only prompts to pick an entry. */
defineProps<{ entries: readonly HistoryEntry[]; paneShown: boolean }>();
const emit = defineEmits<{ open: [entry: HistoryEntry]; remove: [entries: HistoryEntry[]]; scan: [] }>();
const { t } = useI18n();
</script>

<template>
  <section class="history">
    <div v-if="!entries.length" class="history-empty">
      <MdIcon name="history" />
      <h2>{{ t('history.emptyTitle') }}</h2>
      <p>{{ t('history.empty') }}</p>
      <button type="button" class="primary" @click="emit('scan')">{{ t('history.scanFirst') }}</button>
    </div>
    <div v-else-if="paneShown" class="history-empty">
      <MdIcon name="rowing" />
      <h2>{{ t('history.pickTitle') }}</h2>
      <p>{{ t('history.pick') }}</p>
    </div>
    <HistoryList v-else :entries="entries" :current="null" @open="(entry) => emit('open', entry)" @remove="(list) => emit('remove', list)" />
  </section>
</template>
