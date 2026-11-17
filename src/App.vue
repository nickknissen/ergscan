<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CameraCapture from './components/CameraCapture.vue';
import MdDialog from './components/MdDialog.vue';
import MdIcon from './components/MdIcon.vue';
import PmGuide from './components/PmGuide.vue';
import WorkoutEditor from './components/WorkoutEditor.vue';
import { fitFileName, startTimeFor } from './core/dates';
import { draftKey, hasUnsavedChanges, loadHistory, removeFromHistory, saveToHistory, type HistoryEntry } from './core/history';
import { applyTheme, clearAppData, loadIntroHidden, loadTheme, saveIntroHidden, saveTheme, THEMES, type Theme } from './core/settings';
import { formatTime } from './core/time';
import { emptyRow, isExportable, type ExtraColumn, type Workout } from './core/workout';
import { createConfirm } from './ui/confirm';

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

function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, '1');
  } catch {
    // Storage unavailable: the guide simply shows again next time.
  }
}

const GUIDE_HASH = '#/guide';
const baseUrl = () => location.pathname + location.search;

if (location.hash !== GUIDE_HASH && !guideSeen()) window.history.replaceState(null, '', GUIDE_HASH);
const stage = ref<Stage>(location.hash === GUIDE_HASH ? 'guide' : 'capture');
let stageAfterBack: Stage | null = null;

function openGuide() {
  window.history.pushState({ guide: true }, '', GUIDE_HASH);
  stage.value = 'guide';
}

function goTo(next: Stage) {
  if (stage.value === 'guide' && next !== 'guide') {
    markGuideSeen();
    if (window.history.state?.guide) {
      stageAfterBack = next;
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', baseUrl());
  }
  stage.value = next;
}

function closeGuide() {
  goTo('capture');
}

window.addEventListener('popstate', () => {
  if (location.hash === GUIDE_HASH) {
    stage.value = 'guide';
  } else if (stage.value === 'guide') {
    markGuideSeen();
    stage.value = stageAfterBack ?? 'capture';
  }
  stageAfterBack = null;
});
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
const tabbed = computed(() => ['capture', 'guide', 'history', 'settings'].includes(stage.value));

const theme = ref<Theme>(loadTheme(storage));

watch(theme, (value) => {
  if (storage) saveTheme(storage, value);
  applyTheme(document, value);
});

const introHidden = ref(loadIntroHidden(storage));
const showIntro = computed({
  get: () => !introHidden.value,
  set: (value: boolean) => {
    introHidden.value = !value;
    if (storage) saveIntroHidden(storage, !value);
  },
});

const dialog = createConfirm();

function confirmDialog(key: string, params: Record<string, string> = {}): Promise<boolean> {
  return dialog.confirm({ title: t(`dialog.${key}.title`), body: t(`dialog.${key}.body`, params), confirm: t(`dialog.${key}.confirm`) });
}

async function clearData() {
  if (!storage || !(await confirmDialog('clear'))) return;
  clearAppData(storage);
  history.value = [];
  theme.value = 'system';
  introHidden.value = false;
}
const navTitle = computed(() => {
  if (stage.value === 'review') return t('review.title');
  if (stage.value === 'guide') return t('guide.title');
  if (stage.value === 'history') return t('history.title');
  if (stage.value === 'settings') return t('settings.title');
  return t('app.title');
});

const savedKey = ref<string | null>(null);
const unsaved = computed(() => Boolean(workout.value && hasUnsavedChanges(workout.value, extraColumn.value, savedKey.value)));

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
  savedKey.value = draftKey(entry.workout, entry.extraColumn);
  stage.value = 'review';
}

function saveWorkout() {
  const w = workout.value;
  if (!storage || !historyId.value || !w || !isExportable(w, invalidCells.value)) return;
  history.value = saveToHistory(storage, { id: historyId.value, workout: w, extraColumn: extraColumn.value });
  savedKey.value = draftKey(w, extraColumn.value);
  reviewOrigin.value = 'history';
}

const saved = computed(() => savedKey.value !== null && !unsaved.value);
const canSave = computed(() => !saved.value && isExportable(workout.value, invalidCells.value));

async function discardWorkout() {
  if (unsaved.value && !(await confirmDialog(savedKey.value === null ? 'discardNew' : 'discardChanges'))) return;
  const origin = reviewOrigin.value;
  reset();
  stage.value = origin;
}

async function deleteEntry(entry: HistoryEntry) {
  if (!storage || !(await confirmDialog('remove', { date: entryDate(entry) }))) return;
  history.value = removeFromHistory(storage, entry.id);
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
  savedKey.value = null;
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
  <MdDialog :pending="dialog.pending.value" @settle="dialog.settle" />

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
        <button v-if="stage === 'review'" type="button" class="nav-button" :aria-label="t('review.discard')" @click="discardWorkout">
          <MdIcon name="close" />
        </button>
        <button v-else-if="stage === 'guide'" type="button" class="nav-button" :aria-label="t('review.back', { screen: t('tabs.scan') })" @click="closeGuide">
          <MdIcon name="arrow_back" />
        </button>
      </div>
      <h1 class="navbar-title">{{ navTitle }}</h1>
      <div class="navbar-side">
        <button v-if="stage === 'review' && workout" type="button" class="primary nav-action" :disabled="!canSave" @click="saveWorkout">
          {{ saved ? t('review.saved') : t('review.save') }}
        </button>
      </div>
    </header>

    <main class="screen" :class="`screen-${stage}`">
      <PmGuide v-if="stage === 'guide'" @done="closeGuide" />

      <section v-else-if="stage === 'capture'" class="capture">
        <div v-if="showIntro" class="hero">
          <img src="/icon.svg" alt="" class="hero-icon" width="56" height="56" />
          <p class="hero-tagline">{{ t('app.tagline') }}</p>
          <p class="hero-hint">{{ t('capture.hint') }}</p>
          <button type="button" class="tonal" @click="openGuide">
            <MdIcon name="menu_book" />
            {{ t('guide.open') }}
          </button>
        </div>

        <p v-if="cameraError" class="banner banner-error" role="alert">{{ cameraError }}</p>

        <button v-if="cameraSupported" type="button" class="fab" @click="openCamera">
          <MdIcon name="photo_camera" />
          <span class="fab-label">{{ t('capture.camera') }}</span>
        </button>

        <div class="group">
          <button v-if="!showIntro" type="button" class="group-row tappable" @click="openGuide">
            <MdIcon name="menu_book" class="row-icon" />
            <span class="row-label">{{ t('guide.open') }}</span>
          </button>
          <button v-if="!cameraSupported || cameraError" type="button" class="group-row tappable" @click="photoInput?.click()">
            <MdIcon name="photo_camera" class="row-icon" />
            <span class="row-label">{{ t('capture.takePhoto') }}</span>
          </button>
          <button type="button" class="group-row tappable" @click="chooseImage">
            <MdIcon name="photo_library" class="row-icon" />
            <span class="row-label">{{ t('capture.chooseImage') }}</span>
          </button>
          <button type="button" class="group-row tappable" @click="enterManually">
            <MdIcon name="edit" class="row-icon" />
            <span class="row-label">{{ t('capture.manual') }}</span>
          </button>
        </div>
      </section>

      <section v-else-if="stage === 'history'" class="history">
        <div v-if="!history.length" class="history-empty">
          <MdIcon name="history" />
          <h2>{{ t('history.emptyTitle') }}</h2>
          <p>{{ t('history.empty') }}</p>
          <button type="button" class="primary" @click="stage = 'capture'">{{ t('history.scanFirst') }}</button>
        </div>
        <div v-else class="group">
          <div v-for="entry in history" :key="entry.id" class="group-row">
            <button type="button" class="history-open" @click="openEntry(entry.id)">
              <MdIcon name="rowing" class="row-icon" />
              <span class="row-label">
                {{ entrySummary(entry) }}
                <span class="row-detail">{{ entryDate(entry) }}</span>
              </span>
            </button>
            <button type="button" class="icon" :aria-label="t('history.remove', { date: entryDate(entry) })" @click="deleteEntry(entry)">
              <MdIcon name="delete" />
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="stage === 'settings'" class="settings">
        <h2 class="group-header">{{ t('settings.appearance') }}</h2>
        <div class="group">
          <div class="group-row settings-theme">
            <MdIcon name="contrast" class="row-icon" />
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
                <MdIcon v-if="theme === option" name="check" />
                {{ t(`settings.themes.${option}`) }}
              </button>
            </div>
          </div>
          <label class="group-row tappable">
            <MdIcon name="view_day" class="row-icon" />
            <span class="row-label">
              {{ t('settings.showIntro') }}
              <span class="row-detail">{{ t('settings.showIntroDetail') }}</span>
            </span>
            <input v-model="showIntro" type="checkbox" role="switch" class="switch" />
          </label>
        </div>

        <h2 class="group-header">{{ t('settings.data') }}</h2>
        <div class="group">
          <button type="button" class="group-row tappable settings-danger" @click="clearData">
            <MdIcon name="delete_forever" class="row-icon" />
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
            <MdIcon name="keyboard_arrow_down" class="chevron" />
          </summary>
          <div class="disclosure-body">
            <img v-if="photoUrl" :src="photoUrl" :alt="t('review.photo')" class="photo" />
            <pre>{{ rawText }}</pre>
          </div>
        </details>
      </section>
    </main>

    <nav v-if="tabbed" class="tabbar">
      <button type="button" class="tab" :aria-current="stage === 'capture' || stage === 'guide' ? 'page' : undefined" @click="goTo('capture')">
        <span class="tab-indicator">
          <MdIcon name="document_scanner" :filled="stage === 'capture' || stage === 'guide'" />
        </span>
        <span>{{ t('tabs.scan') }}</span>
      </button>
      <button type="button" class="tab" :aria-current="stage === 'history' ? 'page' : undefined" @click="goTo('history')">
        <span class="tab-indicator">
          <MdIcon name="history" :filled="stage === 'history'" />
        </span>
        <span>{{ t('history.title') }}</span>
      </button>
      <button type="button" class="tab" :aria-current="stage === 'settings' ? 'page' : undefined" @click="goTo('settings')">
        <span class="tab-indicator">
          <MdIcon name="settings" :filled="stage === 'settings'" />
        </span>
        <span>{{ t('settings.title') }}</span>
      </button>
    </nav>

    <footer v-if="stage === 'review' && workout" class="toolbar">
      <p v-if="!saved" class="toolbar-hint toolbar-hint-only">
        {{ invalidCells ? t('review.invalidCells') : canSave ? t('export.saveFirst') : t('export.invalid') }}
      </p>
      <div v-else class="toolbar-actions">
        <button v-if="canShare" type="button" class="primary" :disabled="!canExport" @click="share">
          <MdIcon name="share" />
          {{ t('export.share') }}
        </button>
        <button type="button" :class="canShare ? 'secondary' : 'primary'" :disabled="!canExport" @click="download">
          <MdIcon name="download" />
          {{ t('export.download') }}
        </button>
      </div>
    </footer>
  </div>
</template>
