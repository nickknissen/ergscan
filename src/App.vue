<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppBar from './components/AppBar.vue';
import CameraCapture from './components/CameraCapture.vue';
import HistoryPane from './components/HistoryPane.vue';
import MdDialog from './components/MdDialog.vue';
import MdIcon from './components/MdIcon.vue';
import PmGuide from './components/PmGuide.vue';
import TabBar from './components/TabBar.vue';
import UpdatePrompt from './components/UpdatePrompt.vue';
import { useAppSettings } from './composables/useAppSettings';
import { useFitExport } from './composables/useFitExport';
import { useHistorySync } from './composables/useHistorySync';
import { useImageInput } from './composables/useImageInput';
import { useNavigation } from './composables/useNavigation';
import { useReviewSession } from './composables/useReviewSession';
import { useScan } from './composables/useScan';
import { entryDateLabel } from './core/dates';
import { clearDraft } from './core/draft';
import type { HistoryEntry } from './core/history';
import { clearAppData } from './core/settings';
import { newWorkout } from './core/workout';
import { createConfirm } from './ui/confirm';
import { historyPane, listDetail } from './ui/layout';
import { appShortcut, IMAGE_STAGES, isTextField } from './ui/shortcuts';
import { useMediaQuery } from './ui/mediaQuery';
import { fabCollapsed, screenTransition, type ScreenTransition } from './ui/transitions';
import CaptureView from './views/CaptureView.vue';
import HistoryView from './views/HistoryView.vue';
import ReviewView from './views/ReviewView.vue';
import ScanningView from './views/ScanningView.vue';
import SettingsView from './views/SettingsView.vue';

const { t, locale } = useI18n();

const syncEnabled = import.meta.env.DEV || import.meta.env.VITE_ERGSCAN_SYNC === 'true';
const nav = useNavigation({ syncEnabled });
const { stage, guideMonitor, incomingPair, goTo, openGuide, closeGuide, pickMonitor, changeMonitor, discardWorkout, selectEntry, saveWorkout } =
  nav;

function webStorage(get: () => Storage): Storage | null {
  try {
    return get();
  } catch {
    return null;
  }
}
const storage = webStorage(() => localStorage);
const session = webStorage(() => sessionStorage);

const historySync = useHistorySync(storage, syncEnabled);
const { repository, history, linkedDevice, pendingSync, syncStatus, storageError, readyHistory, refreshHistory, syncNow } = historySync;
const { theme, accent, showIntro, heartRate, maxHr, listPane, reset: resetSettings } = useAppSettings(storage);

const dialog = createConfirm();

function confirmDialog(key: string, params: Record<string, string> = {}): Promise<boolean> {
  return dialog.confirm({ title: t(`dialog.${key}.title`), body: t(`dialog.${key}.body`, params), confirm: t(`dialog.${key}.confirm`) });
}

const review = useReviewSession({ stage, historySync, session, confirmDialog, t });
const {
  workout,
  extraColumn,
  historyId,
  reviewOrigin,
  invalidCells,
  photoUrls,
  rawText,
  notice,
  computedSummary,
  extraImages,
  unsaved,
  saved,
  canSave,
  undoAvailable,
} = review;
nav.connect(review, readyHistory);

const photoInput = useTemplateRef<HTMLInputElement>('photoInput');
const imageInput = useTemplateRef<HTMLInputElement>('imageInput');

function chooseImage() {
  imageInput.value?.click();
}

const scan = useScan({ nav, review, t, pickPhoto: () => photoInput.value?.click() });
const {
  progress,
  progressText,
  cameraSupported,
  cameraError,
  moreRows,
  openCamera,
  closeCamera,
  onCameraFailed,
  stopAddingRows,
  scanMoreRows,
  scanBlob,
  scanPicked,
  onImage,
} = scan;
const photoUrl = computed(() => photoUrls.value.at(-1) ?? null);

const { savedAs, canExport, canShare, download, share, dragFit } = useFitExport({ workout, invalidCells, stage });
review.onClear(() => (savedAs.value = ''));
watch(unsaved, (value) => value && (savedAs.value = ''));

const { dragging } = useImageInput({ acceptsImages: () => IMAGE_STAGES.includes(stage.value), onFiles: scanPicked });

async function clearData() {
  if (!(await confirmDialog(pendingSync.value ? 'syncClearPending' : linkedDevice.value ? 'syncClear' : 'clear'))) return;
  try {
    await readyHistory;
    await repository.clear();
    if (storage) clearAppData(storage);
    if (session) clearDraft(session);
    storageError.value = false;
    await refreshHistory();
  } catch {
    storageError.value = true;
    return;
  }
  resetSettings();
}

async function removeEntries(entries: HistoryEntry[]) {
  const [first] = entries;
  if (!first) return;
  const confirmed =
    entries.length === 1
      ? await confirmDialog('remove', { date: entryDateLabel(first.workout.startTime, locale.value) })
      : await confirmDialog('removeMany', { count: String(entries.length) });
  if (!confirmed) return;
  const ids = entries.map((e) => e.id);
  try {
    await repository.remove(ids);
    storageError.value = false;
    void syncNow();
  } catch {
    storageError.value = true;
    return;
  }
  if (stage.value === 'review' && historyId.value !== null && ids.includes(historyId.value)) nav.leaveReview();
}

let focusOnEnter: string | null = null;

function enterManually() {
  review.clear();
  review.startEntry();
  workout.value = newWorkout();
  focusOnEnter = 'tr.summary .cell';
  nav.showReview(null);
}

function onScreenEnter() {
  if (focusOnEnter) document.querySelector<HTMLElement>(focusOnEnter)?.focus();
  focusOnEnter = null;
}

const transition = ref<ScreenTransition>('fade-through');
watch(stage, (to, from) => (transition.value = screenTransition(from, to)), { flush: 'sync' });

const scrolled = ref(false);
const fabCollapse = ref(false);
let lastScrollY = 0;

function onScroll() {
  const y = window.scrollY;
  scrolled.value = y > 0;
  fabCollapse.value = fabCollapsed(lastScrollY, y, fabCollapse.value);
  lastScrollY = y;
}

function onKeydown(event: KeyboardEvent) {
  const action = appShortcut(event, {
    stage: stage.value,
    editing: isTextField(document.activeElement as HTMLInputElement | null),
    overlayOpen: Boolean(document.querySelector('dialog[open], :popover-open')),
  });
  if (!action) return;
  event.preventDefault();
  if (action === 'open') chooseImage();
  else if (action === 'undo') review.undo();
  else if (action === 'redo') review.redo();
  else if (action === 'save') void saveFromKeyboard();
  else if (stage.value === 'camera') closeCamera();
  else if (stage.value === 'guide') closeGuide();
  else void discardWorkout();
}

async function saveFromKeyboard() {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  focused?.blur();
  await nextTick();
  if (canSave.value) void saveWorkout();
  focused?.focus();
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('keydown', onKeydown);
});

const overflowItems = computed(() => [
  ...(undoAvailable.value.undo ? [{ id: 'undo', label: t('review.undo'), icon: 'undo' as const }] : []),
  ...(undoAvailable.value.redo ? [{ id: 'redo', label: t('review.redo'), icon: 'redo' as const }] : []),
  ...(saved.value && canShare.value ? [{ id: 'download', label: t('export.download'), icon: 'download' as const }] : []),
  { id: 'print', label: t('review.print'), icon: 'print' as const },
]);

function onReviewMenu(id: string) {
  if (id === 'undo') review.undo();
  else if (id === 'redo') review.redo();
  else if (id === 'download') void download();
  else if (id === 'print') window.print();
}

const largeWindow = useMediaQuery('(min-width: 1200px)');
const reviewPanel = computed(() => largeWindow.value && Boolean(photoUrls.value.length || rawText.value));
const wideWindow = useMediaQuery('(min-width: 840px)');
const layout = computed(() => ({
  wide: wideWindow.value,
  stage: stage.value,
  reviewOrigin: reviewOrigin.value,
  sourcePanel: reviewPanel.value,
  entries: history.value.length,
}));
const showListDetail = computed(() => listDetail(layout.value));
const showHistoryPane = computed(() => historyPane(layout.value));
const tabbed = computed(() => ['capture', 'guide', 'history', 'settings'].includes(stage.value) || showListDetail.value);
const historyTab = computed(() => stage.value === 'history' || showListDetail.value);
const originTitle = computed(() => (reviewOrigin.value === 'history' ? t('history.title') : t('tabs.scan')));
</script>

<template>
  <input ref="photoInput" type="file" accept="image/*" capture="environment" hidden @change="onImage" @cancel="stopAddingRows" />
  <input ref="imageInput" type="file" accept="image/*" hidden @change="onImage" />
  <MdDialog :pending="dialog.pending.value" @settle="dialog.settle" />

  <CameraCapture
    v-if="stage === 'camera'"
    @capture="(image) => scanBlob(image, new Date(), true)"
    @cancel="closeCamera"
    @choose="chooseImage"
    @failed="onCameraFailed"
  />

  <div v-else class="shell" :class="{ 'shell-tabbed': tabbed }">
    <AppBar
      :stage="stage"
      :scrolled="scrolled"
      :origin-title="originTitle"
      :show-actions="stage === 'review' && Boolean(workout)"
      :can-save="canSave"
      :saved="saved"
      :overflow-items="overflowItems"
      @back="stage === 'review' ? discardWorkout() : closeGuide()"
      @save="saveWorkout"
      @menu="onReviewMenu"
    />

    <main
      class="screen"
      :class="[`screen-${stage}`, { 'screen-split': showHistoryPane, 'list-collapsed': showHistoryPane && listPane.collapsed }]"
      :style="showHistoryPane ? { '--list-width': `${listPane.width}px` } : undefined"
    >
      <HistoryPane
        v-if="showHistoryPane"
        v-model:list-pane="listPane"
        :entries="history"
        :current="stage === 'review' ? historyId : null"
        @open="selectEntry"
        @remove="removeEntries"
      />

      <p v-if="storageError" class="banner banner-error" role="alert">{{ t('sync.storageFailed') }}</p>

      <Transition :name="transition" mode="out-in" @after-enter="onScreenEnter">
        <PmGuide v-if="stage === 'guide'" :monitor="guideMonitor" @done="closeGuide" @pick="pickMonitor" @change="changeMonitor" />

        <CaptureView
          v-else-if="stage === 'capture'"
          :show-intro="showIntro"
          :camera-error="cameraError"
          :camera-supported="cameraSupported"
          @guide="openGuide"
          @photo="photoInput?.click()"
          @choose="chooseImage"
          @manual="enterManually"
        />

        <HistoryView
          v-else-if="stage === 'history'"
          :entries="history"
          :pane-shown="showHistoryPane"
          @open="selectEntry"
          @remove="removeEntries"
          @scan="goTo('capture')"
        />

        <SettingsView
          v-else-if="stage === 'settings'"
          v-model:theme="theme"
          v-model:accent="accent"
          v-model:show-intro="showIntro"
          v-model:heart-rate="heartRate"
          :entry-count="history.length"
          :linked="Boolean(linkedDevice)"
          :sync="syncEnabled ? {
            store: repository, device: linkedDevice, pending: pendingSync, status: syncStatus,
            incoming: incomingPair, confirm: confirmDialog,
          } : null"
          @sync-now="syncNow"
          @dismiss-pair="incomingPair = ''"
          @clear="clearData"
        />

        <ScanningView v-else-if="stage === 'scanning'" :photo-url="photoUrl" :progress="progress" :progress-text="progressText" />

        <ReviewView
          v-else-if="workout"
          v-model:workout="workout"
          v-model:extra-column="extraColumn"
          v-model:invalid-cells="invalidCells"
          :notice="notice"
          :computed-summary="computedSummary"
          :extra-images="extraImages"
          :more-rows="moreRows"
          :saved="saved"
          :saved-as="savedAs"
          :can-save="canSave"
          :max-hr="maxHr"
          :photo-urls="photoUrls"
          :raw-text="rawText"
          :source-panel="reviewPanel"
          @scan-more-rows="scanMoreRows"
        />
      </Transition>

      <Transition name="fab">
        <button v-if="stage === 'capture' && cameraSupported" key="camera" type="button" class="fab" :class="{ 'fab-collapsed': fabCollapse }" @click="openCamera">
          <MdIcon name="photo_camera" />
          <span class="fab-label">{{ t('capture.camera') }}</span>
        </button>
        <button
          v-else-if="stage === 'review' && saved"
          key="export"
          type="button"
          class="fab"
          :class="{ 'fab-collapsed': fabCollapse }"
          :disabled="!canExport"
          :draggable="canExport"
          @click="canShare ? share() : download()"
          @dragstart="dragFit"
        >
          <MdIcon :name="canShare ? 'share' : 'download'" />
          <span class="fab-label">{{ canShare ? t('export.share') : t('export.download') }}</span>
        </button>
      </Transition>
    </main>

    <UpdatePrompt />

    <div v-if="dragging" class="drop-overlay" aria-hidden="true">
      <MdIcon name="photo_library" />
      {{ t('drop.overlay') }}
    </div>

    <TabBar v-if="tabbed" :stage="stage" :history-tab="historyTab" @go="goTo" />
  </div>
</template>
