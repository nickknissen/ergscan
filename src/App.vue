<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CameraCapture from './components/CameraCapture.vue';
import HistoryList from './components/HistoryList.vue';
import MdDialog from './components/MdDialog.vue';
import MdIcon from './components/MdIcon.vue';
import MdMenu from './components/MdMenu.vue';
import PmGuide from './components/PmGuide.vue';
import UpdatePrompt from './components/UpdatePrompt.vue';
import { useAppSettings } from './composables/useAppSettings';
import { useHistorySync } from './composables/useHistorySync';
import { entryDateLabel, fitFileName, startTimeFor } from './core/dates';
import { clearDraft, loadDraft, saveDraft } from './core/draft';
import { draftKey, hasUnsavedChanges, parseEntry, type HistoryEntry } from './core/history';
import { clampListWidth, clearAppData, LIST_WIDTH, listPaneKey } from './core/settings';
import { parseRoute, routeHash, routeTab, TABS, tabRoute, type Monitor, type TabStage } from './core/route';
import { emptyRow, isExportable, type ExtraColumn, type Workout } from './core/workout';
import { createUndoStack } from './core/undo';
import type { ParsedScan } from './core/pm5Parser';
import { mergeScans, rowsMissing, withAddedRows } from './core/scanMerge';
import type { ScanOutcome } from './ocr/firstParsed';
import { scanFailure } from './ocr/scanFailure';
import { createConfirm } from './ui/confirm';
import { historyPane, listDetail } from './ui/layout';
import { carriesFiles, downloadUrlData, pickImage } from './ui/imageInput';
import { appShortcut, IMAGE_STAGES, isTextField } from './ui/shortcuts';
import { useMediaQuery } from './ui/mediaQuery';
import { fabCollapsed, screenTransition, type ScreenTransition } from './ui/transitions';
import CaptureView from './views/CaptureView.vue';
import HistoryView from './views/HistoryView.vue';
import ReviewView from './views/ReviewView.vue';
import ScanningView from './views/ScanningView.vue';
import SettingsView from './views/SettingsView.vue';

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

const baseUrl = () => location.pathname + location.search;
const isTab = (value: Stage): value is TabStage => (TABS as readonly Stage[]).includes(value);

const syncEnabled = import.meta.env.DEV || import.meta.env.VITE_ERGSCAN_SYNC === 'true';
const incomingPair = ref('');
function readPairLink(): boolean {
  if (!syncEnabled || !location.hash.startsWith('#link/')) return false;
  incomingPair.value = location.hash.slice('#link/'.length);
  window.history.replaceState(null, '', baseUrl() + '#/settings');
  return true;
}
readPairLink();
const initialRoute = parseRoute(location.hash);
if (initialRoute.page === 'home' && !guideSeen()) window.history.replaceState(null, '', routeHash({ page: 'guide', monitor: null }));
const startRoute = parseRoute(location.hash);
const stage = ref<Stage>(startRoute.page === 'guide' ? 'guide' : routeTab(startRoute));
const guideMonitor = ref<Monitor | null>(startRoute.page === 'guide' ? startRoute.monitor : null);
let stageAfterBack: TabStage | null = null;
let ignoreNextPop = false;

function syncTabUrl() {
  if (!isTab(stage.value)) return;
  const hash = routeHash(tabRoute(stage.value));
  if (location.hash !== hash) window.history.replaceState(window.history.state, '', baseUrl() + hash);
}

function openGuide() {
  window.history.pushState({ guide: 1 }, '', routeHash({ page: 'guide', monitor: null }));
  guideMonitor.value = null;
  stage.value = 'guide';
}

function pickMonitor(monitor: Monitor) {
  window.history.pushState({ guide: (window.history.state?.guide ?? 0) + 1 }, '', routeHash({ page: 'guide', monitor }));
  guideMonitor.value = monitor;
}

function changeMonitor() {
  guideMonitor.value = null;
  if (window.history.state?.guide > 1) {
    ignoreNextPop = true;
    window.history.back();
  } else {
    window.history.replaceState(window.history.state, '', routeHash({ page: 'guide', monitor: null }));
  }
}

async function goTo(next: TabStage) {
  if (stage.value === 'review') {
    if (unsaved.value && !(await confirmDiscard())) return;
    leaveReview();
  }
  if (stage.value === 'guide') {
    markGuideSeen();
    const depth: number = window.history.state?.guide ?? 0;
    if (depth > 0) {
      stageAfterBack = next;
      window.history.go(-depth);
      return;
    }
  }
  stage.value = next;
  syncTabUrl();
}

function closeGuide() {
  void goTo('capture');
}

window.addEventListener('popstate', async () => {
  if (readPairLink()) {
    await goTo('settings');
    return;
  }
  if (ignoreNextPop) {
    ignoreNextPop = false;
    syncTabUrl();
    return;
  }
  const route = parseRoute(location.hash);
  if (stage.value === 'review' && route.page !== 'workout') {
    void backFromReview();
  } else if (route.page === 'guide' && stageAfterBack === null) {
    stage.value = 'guide';
    guideMonitor.value = route.monitor;
  } else if (stage.value === 'guide') {
    markGuideSeen();
    stage.value = stageAfterBack ?? routeTab(route);
  } else if (route.page === 'workout' && stage.value !== 'review') {
    if (route.id === null || !(await openEntry(route.id, false))) window.history.replaceState(null, '', baseUrl());
  } else if (isTab(stage.value)) {
    stage.value = routeTab(route);
  }
  stageAfterBack = null;
  syncTabUrl();
});
const workout = ref<Workout | null>(null);
const extraColumn = ref<ExtraColumn | null>(null);
const photoUrls = ref<string[]>([]);
const photoUrl = computed(() => photoUrls.value.at(-1) ?? null);
const scanSoFar = shallowRef<ParsedScan | null>(null);
let addingRows = false;
const rawText = ref('');
const notice = ref('');
const computedSummary = ref(false);
const progressText = ref('');
const progress = ref<number | null>(null);
const extraImages = ref(0);
const savedAs = ref('');

const storage: Storage | null = (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})();
const { repository, history, linkedDevice, pendingSync, syncStatus, storageError, readyHistory, refreshHistory, syncNow } =
  useHistorySync(storage, syncEnabled);

const historyId = ref<string | null>(null);
const reviewOrigin = ref<Tab>('capture');
const tabbed = computed(() => ['capture', 'guide', 'history', 'settings'].includes(stage.value) || showListDetail.value);

const session: Storage | null = (() => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
})();

const { theme, accent, showIntro, heartRate, maxHr, listPane, reset: resetSettings } = useAppSettings(storage);

const dialog = createConfirm();

function confirmDialog(key: string, params: Record<string, string> = {}): Promise<boolean> {
  return dialog.confirm({ title: t(`dialog.${key}.title`), body: t(`dialog.${key}.body`, params), confirm: t(`dialog.${key}.confirm`) });
}

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
  else if (action === 'undo') applyUndo(undoStack.undo());
  else if (action === 'redo') applyUndo(undoStack.redo());
  else if (action === 'save') void saveFromKeyboard();
  else if (stage.value === 'camera') closeCamera();
  else if (stage.value === 'guide') closeGuide();
  else void discardWorkout();
}

async function saveFromKeyboard() {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  focused?.blur();
  await nextTick();
  if (canSave.value) saveWorkout();
  focused?.focus();
}

const dragging = ref(false);
const acceptsImages = () => IMAGE_STAGES.includes(stage.value);

function onDragOver(event: DragEvent) {
  if (!acceptsImages() || !carriesFiles(event.dataTransfer?.types)) return;
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'copy';
  dragging.value = true;
}

function onDragLeave(event: DragEvent) {
  if (event.relatedTarget === null) dragging.value = false;
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  if (!acceptsImages() || !carriesFiles(event.dataTransfer?.types)) return;
  event.preventDefault();
  void scanPicked([...(event.dataTransfer?.files ?? [])]);
}

function onPaste(event: ClipboardEvent) {
  if (!acceptsImages() || isTextField(document.activeElement as HTMLInputElement | null)) return;
  const files = [...(event.clipboardData?.files ?? [])];
  if (!pickImage(files)) return;
  event.preventDefault();
  void scanPicked(files);
}

async function scanPicked(files: File[]) {
  const picked = pickImage(files);
  if (!picked) return;
  await scanBlob(picked.file, new Date(picked.file.lastModified || Date.now()), false);
  if (picked.extra) extraImages.value = picked.extra;
}

const DOCUMENT_LISTENERS = [
  ['keydown', onKeydown],
  ['dragover', onDragOver],
  ['dragleave', onDragLeave],
  ['drop', onDrop],
  ['paste', onPaste],
] as const;

onMounted(() => {
  window.launchQueue?.setConsumer(async ({ files }) => {
    if (files.length) await scanPicked(await Promise.all(files.map((handle) => handle.getFile())));
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  for (const [type, listener] of DOCUMENT_LISTENERS) document.addEventListener(type, listener as EventListener);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  for (const [type, listener] of DOCUMENT_LISTENERS) document.removeEventListener(type, listener as EventListener);
});

const navTitle = computed(() => {
  if (stage.value === 'review') return t('review.title');
  if (stage.value === 'guide') return t('guide.title');
  if (stage.value === 'history') return t('history.title');
  if (stage.value === 'settings') return t('settings.title');
  return t('app.title');
});

const savedKey = ref<string | null>(null);
const savedRevision = ref<string | null>(null);
const saving = ref(false);
const unsaved = computed(() => Boolean(workout.value && hasUnsavedChanges(workout.value, extraColumn.value, savedKey.value)));

function startEntry() {
  historyId.value = crypto.randomUUID();
}

function showReview(id: string | null) {
  stage.value = 'review';
  window.history.pushState({ workout: true }, '', routeHash({ page: 'workout', id }));
}

async function openEntry(id: string, push = true): Promise<boolean> {
  await readyHistory;
  const savedEntry = history.value.find((entry) => entry.id === id);
  const entry = savedEntry && parseEntry(JSON.parse(JSON.stringify(savedEntry)));
  if (!entry) return false;
  reset();
  reviewOrigin.value = 'history';
  historyId.value = entry.id;
  workout.value = entry.workout;
  extraColumn.value = entry.extraColumn;
  savedRevision.value = savedEntry.revision;
  savedKey.value = draftKey(entry.workout, entry.extraColumn);
  if (push) showReview(entry.id);
  else stage.value = 'review';
  return true;
}

async function saveWorkout() {
  const w = workout.value;
  const id = historyId.value;
  if (saving.value || !id || !w || !isExportable(w, invalidCells.value)) return;
  const base = savedRevision.value;
  const data = draftKey(w, extraColumn.value);
  const entry = parseEntry({ id, ...JSON.parse(data) })!;
  saving.value = true;
  if (notice.value === t('sync.deletedEdit')) notice.value = '';
  try {
    await readyHistory;
    const saved = await repository.save(entry, base);
    if (historyId.value === id && stage.value === 'review') {
      if (!saved) {
        notice.value = t('sync.deletedEdit');
        return;
      }
      historyId.value = saved.id;
      savedRevision.value = saved.revision;
      savedKey.value = data;
      reviewOrigin.value = 'history';
      window.history.replaceState(window.history.state, '', routeHash({ page: 'workout', id: saved.id }));
    }
    storageError.value = false;
    void syncNow();
  } catch {
    storageError.value = true;
  } finally {
    saving.value = false;
  }
}

const saved = computed(() => savedKey.value !== null && !unsaved.value);
watch(unsaved, (value) => value && (savedAs.value = ''));
const canSave = computed(() => !saving.value && !saved.value && isExportable(workout.value, invalidCells.value));

function confirmDiscard(): Promise<boolean> {
  return confirmDialog(savedKey.value === null ? 'discardNew' : 'discardChanges');
}

function closeReview() {
  const origin = reviewOrigin.value;
  reset();
  stage.value = origin;
}

function leaveReview() {
  closeReview();
  if (window.history.state?.workout) {
    ignoreNextPop = true;
    window.history.back();
  } else {
    window.history.replaceState(null, '', baseUrl());
    syncTabUrl();
  }
}

async function discardWorkout() {
  if (unsaved.value && !(await confirmDiscard())) return;
  leaveReview();
}

async function backFromReview() {
  if (!unsaved.value) {
    closeReview();
    return;
  }
  window.history.pushState({ workout: true }, '', routeHash({ page: 'workout', id: savedKey.value === null ? null : historyId.value }));
  if (await confirmDiscard()) leaveReview();
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
  if (stage.value === 'review' && historyId.value !== null && ids.includes(historyId.value)) leaveReview();
}

async function selectEntry(entry: HistoryEntry) {
  if (stage.value !== 'review') {
    await openEntry(entry.id);
    return;
  }
  if (historyId.value === entry.id || (unsaved.value && !(await confirmDiscard()))) return;
  if (!(await openEntry(entry.id, false))) return;
  window.history.replaceState(window.history.state, '', routeHash({ page: 'workout', id: entry.id }));
}

const fitModule = shallowRef<FitModule | null>(null);

watch(stage, (value) => {
  if (value === 'review' && !fitModule.value) void import('./core/fitExport').then((m) => (fitModule.value = m));
});

const invalidCells = ref(0);
const canExport = computed(() => Boolean(fitModule.value) && isExportable(workout.value, invalidCells.value));
const canShare = computed(() => typeof navigator.canShare === 'function');
const overflowItems = computed(() => [
  ...(undoAvailable.value.undo ? [{ id: 'undo', label: t('review.undo'), icon: 'undo' as const }] : []),
  ...(undoAvailable.value.redo ? [{ id: 'redo', label: t('review.redo'), icon: 'redo' as const }] : []),
  ...(saved.value && canShare.value ? [{ id: 'download', label: t('export.download'), icon: 'download' as const }] : []),
  { id: 'print', label: t('review.print'), icon: 'print' as const },
]);

const undoStack = createUndoStack<string>();
const undoAvailable = ref({ undo: false, redo: false });
let undoEntry: string | null = null;

function syncUndo() {
  undoAvailable.value = { undo: undoStack.canUndo(), redo: undoStack.canRedo() };
}

watch(
  [historyId, workout, extraColumn],
  () => {
    if (!workout.value) return;
    const snapshot = draftKey(workout.value, extraColumn.value);
    if (historyId.value !== undoEntry) {
      undoEntry = historyId.value;
      undoStack.reset(snapshot);
    } else {
      undoStack.record(snapshot);
    }
    syncUndo();
  },
  { deep: true },
);

function applyUndo(snapshot: string | null) {
  const entry = snapshot && parseEntry({ id: 'undo', ...JSON.parse(snapshot) });
  if (entry) {
    workout.value = entry.workout;
    extraColumn.value = entry.extraColumn;
  }
  syncUndo();
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
const historyTab = computed(() => stage.value === 'history' || showListDetail.value);

let resizeStart: { x: number; width: number } | null = null;

function onDividerKeydown(event: KeyboardEvent) {
  const next = listPaneKey(listPane.value, event.key);
  if (!next) return;
  event.preventDefault();
  listPane.value = next;
  if (next.collapsed) void nextTick(() => document.querySelector<HTMLElement>('.pane-toggle')?.focus());
}

function onDividerPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizeStart = { x: event.clientX, width: listPane.value.collapsed ? LIST_WIDTH.min : listPane.value.width };
}

function onDividerPointerMove(event: PointerEvent) {
  if (!resizeStart) return;
  listPane.value = { width: clampListWidth(resizeStart.width + event.clientX - resizeStart.x), collapsed: false };
}

function onDividerPointerUp() {
  resizeStart = null;
}

function toggleListPane() {
  listPane.value = { ...listPane.value, collapsed: !listPane.value.collapsed };
}
const originTitle = computed(() => (reviewOrigin.value === 'history' ? t('history.title') : t('tabs.scan')));
const cameraSupported = typeof navigator.mediaDevices?.getUserMedia === 'function';
const cameraError = ref('');

function newWorkout(): Workout {
  return { startTime: new Date(), splitDistance: 500, dragFactor: null, name: null, notes: null, feeling: null, summary: emptyRow(), rows: [] };
}

function reset() {
  for (const url of photoUrls.value) URL.revokeObjectURL(url);
  photoUrls.value = [];
  scanSoFar.value = null;
  addingRows = false;
  historyId.value = null;
  savedKey.value = null;
  savedRevision.value = null;
  reviewOrigin.value = 'capture';
  workout.value = null;
  extraColumn.value = null;
  rawText.value = '';
  notice.value = '';
  extraImages.value = 0;
  savedAs.value = '';
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

function closeCamera() {
  stage.value = addingRows ? 'review' : 'capture';
  addingRows = false;
}

function onCameraFailed(message: string) {
  if (addingRows) notice.value = message;
  else cameraError.value = message;
  closeCamera();
}

const moreRows = computed(() => {
  const scan = scanSoFar.value;
  const w = workout.value;
  return scan !== null && w !== null && rowsMissing({ summaryFromScreen: scan.summaryFromScreen, summary: w.summary, rows: w.rows });
});

function stopAddingRows() {
  addingRows = false;
}

function scanMoreRows() {
  addingRows = true;
  if (cameraSupported) openCamera();
  else photoInput.value?.click();
}

async function readImage(image: Blob, framed: boolean): Promise<ScanOutcome> {
  stage.value = 'scanning';
  progressText.value = t('scan.loading');
  progress.value = null;
  const { scanImage } = await import('./ocr/scan');
  return scanImage(
    image,
    (status, value) => {
      const recognizing = status === 'recognizing text';
      progress.value = recognizing ? value : null;
      progressText.value = recognizing ? t('scan.recognizing', { percent: Math.round(value * 100) }) : t('scan.loading');
    },
    framed,
  );
}

async function addRowsFrom(image: Blob, framed: boolean, previous: ParsedScan) {
  photoUrls.value = [...photoUrls.value, URL.createObjectURL(image)];
  notice.value = '';
  try {
    const outcome = await readImage(image, framed);
    rawText.value = [rawText.value, outcome.text].filter(Boolean).join('\n\n');
    if (outcome.scan && workout.value) {
      const merged = mergeScans(previous, outcome.scan);
      workout.value = { ...workout.value, ...withAddedRows(workout.value, previous, merged) };
      extraColumn.value ??= merged.extraColumn;
      scanSoFar.value = merged;
    } else {
      notice.value = t('scan.moreFailed');
    }
  } catch (error) {
    const { key, message } = scanFailure(error, navigator.onLine);
    notice.value = t(key, { message });
  }
  stage.value = 'review';
}

async function scanBlob(image: Blob, photoTime: Date, framed: boolean) {
  const previous = addingRows ? scanSoFar.value : null;
  addingRows = false;
  if (previous && workout.value) return addRowsFrom(image, framed, previous);
  reset();
  startEntry();
  photoUrls.value = [URL.createObjectURL(image)];

  try {
    const outcome = await readImage(image, framed);
    rawText.value = outcome.text;
    const start = photoTime;
    if (outcome.scan) {
      const { scan } = outcome;
      scanSoFar.value = scan;
      const elapsedDs = scan.rows.length > 0 ? scan.rows.reduce((a, r) => a + (r.durationDs ?? 0), 0) : (scan.summary.durationDs ?? 0);
      const startTime = startTimeFor(scan.date, photoTime, elapsedDs);
      workout.value = { ...newWorkout(), startTime, splitDistance: scan.splitDistance, dragFactor: scan.dragFactor, summary: scan.summary, rows: scan.rows };
      extraColumn.value = outcome.scan.extraColumn;
      computedSummary.value = !outcome.scan.summaryFromScreen;
    } else {
      workout.value = { ...newWorkout(), startTime: start };
      notice.value = t('scan.failed');
    }
  } catch (error) {
    workout.value = newWorkout();
    const { key, message } = scanFailure(error, navigator.onLine);
    notice.value = t(key, { message });
  }
  showReview(null);
}

let focusOnEnter: string | null = null;

function enterManually() {
  reset();
  startEntry();
  workout.value = newWorkout();
  focusOnEnter = 'tr.summary .cell';
  showReview(null);
}

function onScreenEnter() {
  if (focusOnEnter) document.querySelector<HTMLElement>(focusOnEnter)?.focus();
  focusOnEnter = null;
}

watch(
  [stage, workout, extraColumn, savedKey, savedRevision, reviewOrigin],
  () => {
    if (!session) return;
    if (stage.value !== 'review' || !workout.value || !historyId.value) {
      clearDraft(session);
      return;
    }
    saveDraft(session, {
      id: historyId.value,
      workout: workout.value,
      extraColumn: extraColumn.value,
      savedKey: savedKey.value,
      revision: savedRevision.value ?? undefined,
      origin: reviewOrigin.value,
      rawText: rawText.value,
      notice: notice.value,
      computedSummary: computedSummary.value,
    });
  },
  { deep: true },
);

function restoreDraft(id: string | null): boolean {
  const draft = session && loadDraft(session, id);
  if (!draft) return false;
  reset();
  historyId.value = draft.id;
  workout.value = draft.workout;
  extraColumn.value = draft.extraColumn;
  savedKey.value = draft.savedKey;
  const existing = history.value.find((entry) => entry.id === draft.id);
  savedRevision.value = draft.revision ?? (existing && draftKey(existing.workout, existing.extraColumn) === draft.savedKey ?
    existing.revision : null);
  reviewOrigin.value = draft.origin;
  rawText.value = draft.rawText;
  notice.value = draft.notice;
  computedSummary.value = draft.computedSummary;
  stage.value = 'review';
  return true;
}

if (initialRoute.page === 'workout') {
  const route = initialRoute;
  void readyHistory.then(async () => {
    if (location.hash !== routeHash(route)) return;
    if (!restoreDraft(route.id) && (route.id === null || !(await openEntry(route.id, false)))) {
      window.history.replaceState(null, '', baseUrl());
    }
  });
}

function fitFile(): File {
  const w = workout.value!;
  const bytes = fitModule.value!.workoutToFit(w);
  return new File([bytes.slice().buffer], fitFileName(w.startTime), { type: 'application/vnd.ant.fit' });
}

async function download() {
  const file = fitFile();
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description: 'FIT', accept: { [file.type]: ['.fit'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      savedAs.value = handle.name;
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  savedAs.value = file.name;
}

function onReviewMenu(id: string) {
  if (id === 'undo') applyUndo(undoStack.undo());
  else if (id === 'redo') applyUndo(undoStack.redo());
  else if (id === 'download') void download();
  else if (id === 'print') window.print();
}

function dragFit(event: DragEvent) {
  if (!event.dataTransfer || !canExport.value) return;
  const file = fitFile();
  const url = URL.createObjectURL(file);
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('DownloadURL', downloadUrlData(file, url));
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function share() {
  const file = fitFile();
  if (!navigator.canShare({ files: [file] })) {
    await download();
    return;
  }
  try {
    await navigator.share({ files: [file], title: file.name });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) await download();
  }
}
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
    <header class="navbar" :class="{ 'navbar-scrolled': scrolled }">
      <div class="navbar-side">
        <button
          v-if="stage === 'review'"
          type="button"
          class="nav-button"
          :aria-label="t('review.back', { screen: originTitle })"
          :title="t('review.back', { screen: originTitle })"
          @click="discardWorkout"
        >
          <MdIcon name="arrow_back" />
        </button>
        <button
          v-else-if="stage === 'guide'"
          type="button"
          class="nav-button"
          :aria-label="t('review.back', { screen: t('tabs.scan') })"
          :title="t('review.back', { screen: t('tabs.scan') })"
          @click="closeGuide"
        >
          <MdIcon name="arrow_back" />
        </button>
      </div>
      <h1 class="navbar-title">{{ navTitle }}</h1>
      <div class="navbar-side">
        <button v-if="stage === 'review' && workout" type="button" class="primary nav-action" :disabled="!canSave" @click="saveWorkout">
          {{ saved ? t('review.saved') : t('review.save') }}
        </button>
        <MdMenu v-if="stage === 'review' && workout" :label="t('review.more')" :items="overflowItems" @select="onReviewMenu" />
      </div>
    </header>

    <main
      class="screen"
      :class="[`screen-${stage}`, { 'screen-split': showHistoryPane, 'list-collapsed': showHistoryPane && listPane.collapsed }]"
      :style="showHistoryPane ? { '--list-width': `${listPane.width}px` } : undefined"
    >
      <aside v-if="showHistoryPane" v-show="!listPane.collapsed" id="history-pane" class="history-pane" :aria-label="t('history.title')">
        <HistoryList :entries="history" :current="stage === 'review' ? historyId : null" @open="selectEntry" @remove="removeEntries" />
      </aside>
      <div v-if="showHistoryPane" class="pane-divider">
        <button
          type="button"
          class="icon pane-toggle"
          :aria-label="listPane.collapsed ? t('history.expand') : t('history.collapse')"
          :title="listPane.collapsed ? t('history.expand') : t('history.collapse')"
          aria-controls="history-pane"
          :aria-expanded="!listPane.collapsed"
          @click="toggleListPane"
        >
          <MdIcon :name="listPane.collapsed ? 'left_panel_open' : 'left_panel_close'" />
        </button>
        <div
          v-if="!listPane.collapsed"
          class="pane-handle"
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          aria-controls="history-pane"
          :aria-label="t('history.resize')"
          :title="t('history.resize')"
          :aria-valuemin="LIST_WIDTH.min"
          :aria-valuemax="LIST_WIDTH.max"
          :aria-valuenow="listPane.width"
          @keydown="onDividerKeydown"
          @pointerdown="onDividerPointerDown"
          @pointermove="onDividerPointerMove"
          @pointerup="onDividerPointerUp"
          @pointercancel="onDividerPointerUp"
          @dblclick="listPane = { width: LIST_WIDTH.initial, collapsed: false }"
        ></div>
      </div>

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
          @scan="stage = 'capture'"
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

    <nav v-if="tabbed" class="tabbar">
      <button type="button" class="tab" :aria-current="stage === 'capture' || stage === 'guide' ? 'page' : undefined" @click="goTo('capture')">
        <span class="tab-indicator">
          <MdIcon name="document_scanner" :filled="stage === 'capture' || stage === 'guide'" />
        </span>
        <span>{{ t('tabs.scan') }}</span>
      </button>
      <button type="button" class="tab" :aria-current="historyTab ? 'page' : undefined" @click="goTo('history')">
        <span class="tab-indicator">
          <MdIcon name="history" :filled="historyTab" />
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
  </div>
</template>
