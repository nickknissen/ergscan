<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import WorkoutEditor from './components/WorkoutEditor.vue';
import { fitFileName, startTimeFor } from './core/dates';
import { emptyRow, type ExtraColumn, type Workout } from './core/workout';

type Stage = 'capture' | 'scanning' | 'review';
type FitModule = typeof import('./core/fitExport');

const { t } = useI18n();

const stage = ref<Stage>('capture');
const workout = ref<Workout | null>(null);
const extraColumn = ref<ExtraColumn | null>(null);
const photoUrl = ref<string | null>(null);
const rawText = ref('');
const notice = ref('');
const computedSummary = ref(false);
const progressText = ref('');

const fitModule = shallowRef<FitModule | null>(null);

watch(stage, (value) => {
  if (value === 'review' && !fitModule.value) void import('./core/fitExport').then((m) => (fitModule.value = m));
});

const canExport = computed(() => Boolean(fitModule.value && workout.value?.summary.durationDs && workout.value.summary.distanceM));
const canShare = computed(() => typeof navigator.canShare === 'function');

function newWorkout(): Workout {
  return { startTime: new Date(), splitDistance: 500, summary: emptyRow(), rows: [] };
}

function reset() {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
  photoUrl.value = null;
  workout.value = null;
  extraColumn.value = null;
  rawText.value = '';
  notice.value = '';
  computedSummary.value = false;
  stage.value = 'capture';
}

async function onImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  reset();
  photoUrl.value = URL.createObjectURL(file);
  stage.value = 'scanning';
  progressText.value = t('scan.loading');

  try {
    const { scanImage } = await import('./ocr/scan');
    const outcome = await scanImage(file, (status, progress) => {
      progressText.value = status === 'recognizing text' ? t('scan.recognizing', { percent: Math.round(progress * 100) }) : t('scan.loading');
    });
    rawText.value = outcome.text;
    const photoTime = new Date(file.lastModified || Date.now());
    const start = photoTime;
    if (outcome.scan) {
      const { scan } = outcome;
      const elapsedDs = scan.rows.length > 0 ? scan.rows.reduce((a, r) => a + (r.durationDs ?? 0), 0) : (scan.summary.durationDs ?? 0);
      const startTime = startTimeFor(scan.date, photoTime, elapsedDs);
      workout.value = { startTime, splitDistance: scan.splitDistance, summary: scan.summary, rows: scan.rows };
      extraColumn.value = outcome.scan.extraColumn;
      computedSummary.value = !outcome.scan.summaryFromScreen;
    } else {
      workout.value = { ...newWorkout(), startTime: start };
      notice.value = t('scan.failed');
    }
  } catch (error) {
    workout.value = newWorkout();
    notice.value = t('scan.error', { message: error instanceof Error ? error.message : String(error) });
  }
  stage.value = 'review';
}

function enterManually() {
  reset();
  workout.value = newWorkout();
  stage.value = 'review';
}

function fitFile(): File {
  const w = workout.value!;
  const bytes = fitModule.value!.workoutToFit(w);
  return new File([bytes.slice().buffer], fitFileName(w.startTime), { type: 'application/vnd.ant.fit' });
}

function download() {
  const file = fitFile();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function share() {
  const file = fitFile();
  if (!navigator.canShare({ files: [file] })) {
    download();
    return;
  }
  try {
    await navigator.share({ files: [file], title: file.name });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) download();
  }
}
</script>

<template>
  <header class="app-header">
    <h1>{{ t('app.title') }}</h1>
    <p class="muted">{{ t('app.tagline') }}</p>
  </header>

  <main>
    <section v-if="stage === 'capture'" class="capture">
      <p class="muted">{{ t('capture.hint') }}</p>
      <label class="button primary">
        {{ t('capture.takePhoto') }}
        <input type="file" accept="image/*" capture="environment" hidden @change="onImage" />
      </label>
      <label class="button secondary">
        {{ t('capture.chooseImage') }}
        <input type="file" accept="image/*" hidden @change="onImage" />
      </label>
      <button type="button" class="link" @click="enterManually">{{ t('capture.manual') }}</button>
    </section>

    <section v-else-if="stage === 'scanning'" class="scanning" aria-live="polite">
      <img v-if="photoUrl" :src="photoUrl" :alt="t('review.photo')" class="photo" />
      <p>{{ progressText }}</p>
    </section>

    <section v-else-if="workout" class="review">
      <h2>{{ t('review.title') }}</h2>
      <p v-if="notice" class="notice" role="alert">{{ notice }}</p>
      <p v-if="computedSummary" class="muted">{{ t('review.computedSummary') }}</p>

      <WorkoutEditor v-model:workout="workout" v-model:extra-column="extraColumn" />

      <p v-if="!canExport" class="muted">{{ t('export.invalid') }}</p>
      <div class="actions">
        <button type="button" class="primary" :disabled="!canExport" @click="download">{{ t('export.download') }}</button>
        <button v-if="canShare" type="button" class="secondary" :disabled="!canExport" @click="share">{{ t('export.share') }}</button>
        <button type="button" class="link" @click="reset">{{ t('export.newScan') }}</button>
      </div>

      <details v-if="photoUrl || rawText" class="debug">
        <summary>{{ t('review.rawText') }}</summary>
        <img v-if="photoUrl" :src="photoUrl" :alt="t('review.photo')" class="photo" />
        <pre>{{ rawText }}</pre>
      </details>
    </section>
  </main>
</template>
