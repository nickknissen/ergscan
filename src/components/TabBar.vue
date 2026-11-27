<script setup lang="ts">
import MdIcon from '@nickknissen/m3-vue/components/MdIcon.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TabStage } from '../core/route';

/** `historyTab`: History is the current tab, also while a workout is open beside the history list. */
const props = defineProps<{ stage: string; historyTab: boolean }>();
const emit = defineEmits<{ go: [tab: TabStage] }>();
const { t } = useI18n();

const scanTab = computed(() => props.stage === 'capture' || props.stage === 'guide');
</script>

<template>
  <nav class="tabbar">
    <button type="button" class="tab" :aria-current="scanTab ? 'page' : undefined" @click="emit('go', 'capture')">
      <span class="tab-indicator">
        <MdIcon name="document_scanner" :filled="scanTab" />
      </span>
      <span>{{ t('tabs.scan') }}</span>
    </button>
    <button type="button" class="tab" :aria-current="historyTab ? 'page' : undefined" @click="emit('go', 'history')">
      <span class="tab-indicator">
        <MdIcon name="history" :filled="historyTab" />
      </span>
      <span>{{ t('history.title') }}</span>
    </button>
    <button type="button" class="tab" :aria-current="stage === 'settings' ? 'page' : undefined" @click="emit('go', 'settings')">
      <span class="tab-indicator">
        <MdIcon name="settings" :filled="stage === 'settings'" />
      </span>
      <span>{{ t('settings.title') }}</span>
    </button>
  </nav>
</template>
