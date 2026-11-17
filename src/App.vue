<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CameraCapture from './components/CameraCapture.vue';
import PmGuide from './components/PmGuide.vue';
import WorkoutEditor from './components/WorkoutEditor.vue';
import { fitFileName, startTimeFor } from './core/dates';
import { loadHistory, removeFromHistory, saveToHistory, type HistoryEntry } from './core/history';
import { applyTheme, clearAppData, loadTheme, saveTheme, THEMES, type Theme } from './core/settings';
import { formatTime } from './core/time';
import { emptyRow, isBlank, isExportable, type ExtraColumn, type Workout } from './core/workout';

type Stage = 'guide' | 'capture' | 'history' | 'settings' | 'camera' | 'scanning' | 'review';
type Tab = 'capture' | 'history';
type FitModule = typeof import('./core/fitExport');

const { t, locale } = useI18n();

const GUIDE_SEEN_KEY = 'ergscan.guideSeen';

function guideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function closeGuide() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, '1');
  } catch {
    // Storage unavailable: the guide simply shows again next time.
  }
  stage.value = 'capture';
}

const stage = ref<Stage>(guideSeen() ? 'capture' : 'guide');
const workout = ref<Workout | null>(null);
const extraColumn = ref<ExtraColumn | null>(null);
const photoUrl = ref<string | null>(null);
const rawText = ref('');
const notice = ref('');
const computedSummary = ref(false);
const progressText = ref('');
const progress = ref<number | null>(null);

const storage: Storage | null = (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})();
const history = ref<HistoryEntry[]>(storage ? loadHistory(storage) : []);
const historyId = ref<string | null>(null);
const reviewOrigin = ref<Tab>('capture');
const tabbed = computed(() => stage.value === 'capture' || stage.value === 'history' || stage.value === 'settings');

const theme = ref<Theme>(loadTheme(storage));

watch(theme, (value) => {
  if (storage) saveTheme(storage, value);
  applyTheme(document, value);
});

function clearData() {
  if (!storage || !window.confirm(t('settings.clearConfirm'))) return;
  clearAppData(storage);
  history.value = [];
  theme.value = 'system';
}
const reviewBackLabel = computed(() =>
  t('review.back', { screen: reviewOrigin.value === 'history' ? t('history.title') : t('tabs.scan') }),
);
const navTitle = computed(() => {
  if (stage.value === 'review') return t('review.title');
  if (stage.value === 'guide') return t('guide.title');
  if (stage.value === 'history') return t('history.title');
  if (stage.value === 'settings') return t('settings.title');
  return t('app.title');
});

watch(
  [workout, extraColumn],
  () => {
    const w = workout.value;
    if (stage.value !== 'review' || !storage || !historyId.value || !w?.summary.durationDs || !w.summary.distanceM) return;
    history.value = saveToHistory(storage, { id: historyId.value, workout: w, extraColumn: extraColumn.value });
  },
  { deep: true },
);

function startEntry() {
  historyId.value = crypto.randomUUID();
}

function openEntry(id: string) {
  const entry = storage && loadHistory(storage).find((e) => e.id === id);
  if (!entry) return;
  reset();
  reviewOrigin.value = 'history';
  historyId.value = entry.id;
  workout.value = entry.workout;
  extraColumn.value = entry.extraColumn;
  stage.value = 'review';
}

function leaveReview() {
  const w = workout.value;
  const unsaved = w && !isExportable(w, 0) && !isBlank(w);
  if (unsaved && !window.confirm(t('review.discardConfirm'))) return;
  const origin = reviewOrigin.value;
  reset();
  stage.value = origin;
}

function deleteEntry(id: string) {
  if (storage) history.value = removeFromHistory(storage, id);
}

function entryDate(entry: HistoryEntry): string {
  return entry.workout.startTime.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
}

function entrySummary(entry: HistoryEntry): string {
  const { distanceM, durationDs } = entry.workout.summary;
  return t('history.summary', { distance: distanceM, time: formatTime(durationDs ?? 0) });
}

const fitModule = shallowRef<FitModule | null>(null);

watch(stage, (value) => {
  if (value === 'review' && !fitModule.value) void import('./core/fitExport').then((m) => (fitModule.value = m));
});

const invalidCells = ref(0);
const canExport = computed(() => Boolean(fitModule.value) && isExportable(workout.value, invalidCells.value));
const canShare = computed(() => typeof navigator.canShare === 'function');
const cameraSupported = typeof navigator.mediaDevices?.getUserMedia === 'function';
const cameraError = ref('');

function newWorkout(): Workout {
  return { startTime: new Date(), splitDistance: 500, summary: emptyRow(), rows: [] };
}

function reset() {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
  photoUrl.value = null;
  historyId.value = null;
  reviewOrigin.value = 'capture';
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

const photoInput = useTemplateRef<HTMLInputElement>('photoInput');
const imageInput = useTemplateRef<HTMLInputElement>('imageInput');

function chooseImage() {
  imageInput.value?.click();
}

function openCamera() {
  cameraError.value = '';
  stage.value = 'camera';
}

function onCameraFailed(message: string) {
  cameraError.value = message;
  stage.value = 'capture';
}

async function scanBlob(image: Blob, photoTime: Date, framed: boolean) {
  reset();
  startEntry();
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
  startEntry();
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
  <input ref="photoInput" type="file" accept="image/*" capture="environment" hidden @change="onImage" />
  <input ref="imageInput" type="file" accept="image/*" hidden @change="onImage" />

  <CameraCapture
    v-if="stage === 'camera'"
    @capture="(image) => scanBlob(image, new Date(), true)"
    @cancel="stage = 'capture'"
    @choose="chooseImage"
    @failed="onCameraFailed"
  />

  <div v-else class="shell" :class="{ 'shell-tabbed': tabbed }">
    <header class="navbar">
      <div class="navbar-side">
        <button v-if="stage === 'review'" type="button" class="nav-button" :aria-label="reviewBackLabel" @click="leaveReview">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <button v-else-if="stage === 'guide'" type="button" class="nav-button" :aria-label="t('app.title')" @click="closeGuide">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
      </div>
      <h1 class="navbar-title">{{ navTitle }}</h1>
      <div class="navbar-side"></div>
    </header>

    <main class="screen" :class="`screen-${stage}`">
      <PmGuide v-if="stage === 'guide'" @done="closeGuide" />

      <section v-else-if="stage === 'capture'" class="capture">
        <div class="hero">
          <img src="/icon.svg" alt="" class="hero-icon" width="56" height="56" />
          <p class="hero-tagline">{{ t('app.tagline') }}</p>
          <p class="hero-hint">{{ t('capture.hint') }}</p>
          <button type="button" class="tonal" @click="stage = 'guide'">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="3" width="14" height="18" rx="2" />
              <path d="M9 8h6M9 12h6M9 16h3" />
            </svg>
            {{ t('guide.open') }}
          </button>
        </div>

        <p v-if="cameraError" class="banner banner-error" role="alert">{{ cameraError }}</p>

        <button v-if="cameraSupported" type="button" class="fab" @click="openCamera">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {{ t('capture.camera') }}
        </button>

        <div class="group">
          <button v-if="!cameraSupported || cameraError" type="button" class="group-row tappable" @click="photoInput?.click()">
            <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span class="row-label">{{ t('capture.takePhoto') }}</span>
          </button>
          <button type="button" class="group-row tappable" @click="chooseImage">
            <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="M20 16l-5-5-8 8" />
            </svg>
            <span class="row-label">{{ t('capture.chooseImage') }}</span>
          </button>
          <button type="button" class="group-row tappable" @click="enterManually">
            <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16z" />
              <path d="M13 7l4 4" />
            </svg>
            <span class="row-label">{{ t('capture.manual') }}</span>
          </button>
        </div>
      </section>

      <section v-else-if="stage === 'history'" class="history">
        <div v-if="!history.length" class="history-empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <h2>{{ t('history.emptyTitle') }}</h2>
          <p>{{ t('history.empty') }}</p>
          <button type="button" class="primary" @click="stage = 'capture'">{{ t('history.scanFirst') }}</button>
        </div>
        <div v-else class="group">
          <div v-for="entry in history" :key="entry.id" class="group-row">
            <button type="button" class="history-open" @click="openEntry(entry.id)">
              <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></svg>
              <span class="row-label">
                {{ entrySummary(entry) }}
                <span class="row-detail">{{ entryDate(entry) }}</span>
              </span>
            </button>
            <button type="button" class="icon" :aria-label="t('history.remove', { date: entryDate(entry) })" @click="deleteEntry(entry.id)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="stage === 'settings'" class="settings">
        <h2 class="group-header">{{ t('settings.appearance') }}</h2>
        <div class="group">
          <div class="group-row settings-theme">
            <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" /></svg>
            <span class="row-label">{{ t('settings.theme') }}</span>
            <div class="segmented" role="radiogroup" :aria-label="t('settings.theme')">
              <button
                v-for="option in THEMES"
                :key="option"
                type="button"
                role="radio"
                :aria-checked="theme === option"
                @click="theme = option"
              >
                <svg v-if="theme === option" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                {{ t(`settings.themes.${option}`) }}
              </button>
            </div>
          </div>
        </div>

        <h2 class="group-header">{{ t('settings.data') }}</h2>
        <div class="group">
          <button type="button" class="group-row tappable settings-danger" @click="clearData">
            <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
            <span class="row-label">
              {{ t('settings.clear') }}
              <span class="row-detail">{{ t('settings.clearDetail', history.length) }}</span>
            </span>
          </button>
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

        <WorkoutEditor v-model:workout="workout" v-model:extra-column="extraColumn" v-model:invalid-count="invalidCells" />

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

    <nav v-if="tabbed" class="tabbar">
      <button type="button" class="tab" :aria-current="stage === 'capture' ? 'page' : undefined" @click="stage = 'capture'">
        <span class="tab-indicator">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span>{{ t('tabs.scan') }}</span>
      </button>
      <button type="button" class="tab" :aria-current="stage === 'history' ? 'page' : undefined" @click="stage = 'history'">
        <span class="tab-indicator">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span>{{ t('history.title') }}</span>
      </button>
      <button type="button" class="tab" :aria-current="stage === 'settings' ? 'page' : undefined" @click="stage = 'settings'">
        <span class="tab-indicator">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
          </svg>
        </span>
        <span>{{ t('settings.title') }}</span>
      </button>
    </nav>

    <footer v-if="stage === 'review' && workout" class="toolbar">
      <p v-if="!canExport" class="toolbar-hint">{{ invalidCells ? t('review.invalidCells') : t('export.invalid') }}</p>
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
