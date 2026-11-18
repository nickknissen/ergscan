<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/** `progress`: 0–1 while text is recognized, null while OCR is loading. */
defineProps<{ photoUrl: string | null; progress: number | null; progressText: string }>();
const { t } = useI18n();
</script>

<template>
  <section class="scanning" aria-live="polite">
    <div v-if="photoUrl" class="scan-photo">
      <img :src="photoUrl" :alt="t('review.photo')" />
      <span class="scan-line" aria-hidden="true"></span>
    </div>
    <div class="progress" :class="{ indeterminate: progress === null }" role="progressbar" :aria-valuenow="progress === null ? undefined : Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
      <span :style="progress === null ? undefined : { width: `${Math.round(progress * 100)}%` }"></span>
    </div>
    <p class="scan-status">{{ progressText }}</p>
  </section>
</template>
