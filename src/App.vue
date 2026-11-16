<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CameraCapture from './components/CameraCapture.vue';
import WorkoutEditor from './components/WorkoutEditor.vue';
import { fitFileName, startTimeFor } from './core/dates';
import { emptyRow, type ExtraColumn, type Workout } from './core/workout';

type Stage = 'capture' | 'camera' | 'scanning' | 'review';
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
const progress = ref<number | null>(null);

const fitModule = shallowRef<FitModule | null>(null);

watch(stage, (value) => {
  if (value === 'review' && !fitModule.value) void import('./core/fitExport').then((m) => (fitModule.value = m));
});

const canExport = computed(() => Boolean(fitModule.value && workout.value?.summary.durationDs && workout.value.summary.distanceM));
const canShare = computed(() => typeof navigator.canShare === 'function');
const cameraSupported = typeof navigator.mediaDevices?.getUserMedia === 'function';
const cameraError = ref('');

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
  await scanBlob(file, new Date(file.lastModified || Date.now()), false);
}

function openCamera() {
  cameraError.value = '';
  stage.value = 'camera';
}

function onCameraFailed(message: string) {
  cameraError.value = t('camera.failed', { message });
  stage.value = 'capture';
}

async function scanBlob(image: Blob, photoTime: Date, framed: boolean) {
  reset();
  photoUrl.value = URL.createObjectURL(image);
  stage.value = 'scanning';
  progressText.value = t('scan.loading');
  progress.value = null;

  try {
    const { scanImage } = await import('./ocr/scan');
    const outcome = await scanImage(
      image,
      (status, value) => {
        const recognizing = status === 'recognizing text';
        progress.value = recognizing ? value : null;
        progressText.value = recognizing ? t('scan.recognizing', { percent: Math.round(value * 100) }) : t('scan.loading');
      },
      framed,
    );
    rawText.value = outcome.text;
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
  <CameraCapture
    v-if="stage === 'camera'"
    @capture="(image) => scanBlob(image, new Date(), true)"
    @cancel="stage = 'capture'"
    @failed="onCameraFailed"
  />

  <div v-else class="shell">
    <header class="navbar">
      <div class="navbar-side">
        <button v-if="stage === 'review'" type="button" class="nav-button" :aria-label="t('export.newScan')" @click="reset">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          <span>{{ t('export.newScan') }}</span>
        </button>
      </div>
      <h1 class="navbar-title">{{ stage === 'review' ? t('review.title') : t('app.title') }}</h1>
      <div class="navbar-side"></div>
    </header>

    <main class="screen" :class="`screen-${stage}`">
      <section v-if="stage === 'capture'" class="capture">
        <div class="hero">
          <img src="/icon.svg" alt="" class="hero-icon" width="88" height="88" />
          <p class="hero-tagline">{{ t('app.tagline') }}</p>
        </div>

        <p v-if="cameraError" class="banner banner-error" role="alert">{{ cameraError }}</p>

        <div class="tip">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          <p>{{ t('capture.hint') }}</p>
        </div>

        <div class="capture-actions">
          <button v-if="cameraSupported" type="button" class="primary large" @click="openCamera">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {{ t('capture.camera') }}
          </button>

          <div class="group">
            <label v-if="!cameraSupported || cameraError" class="group-row tappable">
              <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span class="row-label">{{ t('capture.takePhoto') }}</span>
              <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              <input type="file" accept="image/*" capture="environment" hidden @change="onImage" />
            </label>
            <label class="group-row tappable">
              <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.5" />
                <path d="M20 16l-5-5-8 8" />
              </svg>
              <span class="row-label">{{ t('capture.chooseImage') }}</span>
              <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              <input type="file" accept="image/*" hidden @change="onImage" />
            </label>
            <button type="button" class="group-row tappable" @click="enterManually">
              <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13 7l4 4" />
              </svg>
              <span class="row-label">{{ t('capture.manual') }}</span>
              <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="stage === 'scanning'" class="scanning" aria-live="polite">
        <div v-if="photoUrl" class="scan-photo">
          <img :src="photoUrl" :alt="t('review.photo')" />
          <span class="scan-line" aria-hidden="true"></span>
        </div>
        <div class="progress" :class="{ indeterminate: progress === null }" role="progressbar" :aria-valuenow="progress === null ? undefined : Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
          <span :style="progress === null ? undefined : { width: `${Math.round(progress * 100)}%` }"></span>
        </div>
        <p class="scan-status">{{ progressText }}</p>
      </section>

      <section v-else-if="workout" class="review">
        <p v-if="notice" class="banner banner-error" role="alert">{{ notice }}</p>
        <p v-if="computedSummary" class="banner">{{ t('review.computedSummary') }}</p>

        <WorkoutEditor v-model:workout="workout" v-model:extra-column="extraColumn" />

        <details v-if="photoUrl || rawText" class="group disclosure">
          <summary class="group-row tappable">
            <span class="row-label">{{ t('review.rawText') }}</span>
            <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </summary>
          <div class="disclosure-body">
            <img v-if="photoUrl" :src="photoUrl" :alt="t('review.photo')" class="photo" />
            <pre>{{ rawText }}</pre>
          </div>
        </details>
      </section>
    </main>

    <footer v-if="stage === 'review' && workout" class="toolbar">
      <p v-if="!canExport" class="toolbar-hint">{{ t('export.invalid') }}</p>
      <div class="toolbar-actions">
        <button v-if="canShare" type="button" class="primary" :disabled="!canExport" @click="share">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M6 12v8h12v-8" /></svg>
          {{ t('export.share') }}
        </button>
        <button type="button" :class="canShare ? 'secondary' : 'primary'" :disabled="!canExport" @click="download">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4M5 20h14" /></svg>
          {{ t('export.download') }}
        </button>
      </div>
    </footer>
  </div>
</template>
