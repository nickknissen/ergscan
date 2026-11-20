<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import HeartRateZones from '../components/HeartRateZones.vue';
import MdIcon from '../components/MdIcon.vue';
import WorkoutEditor from '../components/WorkoutEditor.vue';
import type { WatchMessage } from '../composables/useWatchHeartRate';
import type { ExtraColumn, Workout } from '../core/workout';

const workout = defineModel<Workout>('workout', { required: true });
const extraColumn = defineModel<ExtraColumn | null>('extraColumn', { required: true });
const invalidCells = defineModel<number>('invalidCells', { required: true });

/** `sourcePanel`: show the photos and recognized text beside the editor instead of below it. */
defineProps<{
  notice: string;
  computedSummary: boolean;
  extraImages: number;
  moreRows: boolean;
  saved: boolean;
  savedAs: string;
  canSave: boolean;
  maxHr: number | null;
  photoUrls: string[];
  rawText: string;
  sourcePanel: boolean;
  watchMessage: WatchMessage | null;
  readingWatch: boolean;
}>();
const emit = defineEmits<{ scanMoreRows: [] }>();
const { t } = useI18n();
</script>

<template>
  <section class="review" :class="{ 'review-split': sourcePanel }">
    <div class="review-main">
      <p v-if="notice" class="banner banner-error" role="alert">{{ notice }}</p>
      <p v-if="readingWatch" class="banner" role="status">{{ t('watch.reading') }}</p>
      <p v-else-if="watchMessage" class="banner" :class="{ 'banner-error': watchMessage.error }" :role="watchMessage.error ? 'alert' : 'status'">
        {{ watchMessage.text }}
      </p>
      <p v-if="computedSummary" class="banner">{{ t('review.computedSummary') }}</p>
      <p v-if="extraImages" class="banner">{{ t('drop.extra', extraImages) }}</p>
      <div v-if="moreRows" class="banner banner-action">
        <p>{{ t('review.moreRows') }}</p>
        <button type="button" class="tonal" @click="emit('scanMoreRows')">
          <MdIcon name="photo_camera" />
          {{ t('review.scanMoreRows') }}
        </button>
      </div>

      <WorkoutEditor v-model:workout="workout" v-model:extra-column="extraColumn" v-model:invalid-count="invalidCells" />

      <p v-if="!saved && !invalidCells" class="review-hint">{{ canSave ? t('export.saveFirst') : t('export.invalid') }}</p>
      <p v-else-if="savedAs" class="review-hint">{{ t('export.savedAs', { name: savedAs }) }}</p>

      <HeartRateZones :workout="workout" :max-hr="maxHr" />

      <details v-if="!sourcePanel && (photoUrls.length || rawText)" class="group disclosure">
        <summary class="group-row tappable">
          <span class="row-label">{{ t('review.rawText') }}</span>
          <MdIcon name="keyboard_arrow_down" class="chevron" />
        </summary>
        <div class="disclosure-body">
          <img v-for="url in photoUrls" :key="url" :src="url" :alt="t('review.photo')" class="photo" />
          <pre>{{ rawText }}</pre>
        </div>
      </details>
    </div>

    <aside v-if="sourcePanel" class="review-panel" :aria-label="t('review.rawText')">
      <h2 class="group-header">{{ t('review.rawText') }}</h2>
      <div class="group">
        <div class="disclosure-body">
          <img v-for="url in photoUrls" :key="url" :src="url" :alt="t('review.photo')" class="photo" />
          <pre>{{ rawText }}</pre>
        </div>
      </div>
    </aside>
  </section>
</template>
