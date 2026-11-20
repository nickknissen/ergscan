import { computed, ref, watch, type Ref } from 'vue';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../core/draft';
import { draftKey, hasUnsavedChanges, parseEntry, type HistoryEntry } from '../core/history';
import { createUndoStack } from '../core/undo';
import { isExportable, type ExtraColumn, type Workout } from '../core/workout';
import type { useHistorySync } from './useHistorySync';

type HistorySync = Pick<ReturnType<typeof useHistorySync>, 'repository' | 'history' | 'readyHistory' | 'storageError' | 'syncNow'>;
export type ReviewOrigin = 'capture' | 'history';

/**
 * The workout open on the review screen: its data, the photos and text it was scanned from,
 * whether and where it is saved, undo, and the draft kept in session storage across reloads.
 *
 * Which screen shows is not decided here: `stage` is only read, to keep a draft and finish a save
 * only while the review screen is showing.
 */
export function useReviewSession(options: {
  stage: Ref<string>;
  historySync: HistorySync;
  session: Storage | null;
  confirmDialog: (key: string) => Promise<boolean>;
  t: (key: string) => string;
}) {
  const { stage, session, confirmDialog, t } = options;
  const { repository, history, readyHistory, storageError, syncNow } = options.historySync;

  const workout = ref<Workout | null>(null);
  const extraColumn = ref<ExtraColumn | null>(null);
  const historyId = ref<string | null>(null);
  const savedKey = ref<string | null>(null);
  const savedRevision = ref<string | null>(null);
  const reviewOrigin = ref<ReviewOrigin>('capture');
  const invalidCells = ref(0);
  const saving = ref(false);
  const photoUrls = ref<string[]>([]);
  const rawText = ref('');
  const notice = ref('');
  const computedSummary = ref(false);
  const extraImages = ref(0);

  const unsaved = computed(() => Boolean(workout.value && hasUnsavedChanges(workout.value, extraColumn.value, savedKey.value)));
  const saved = computed(() => savedKey.value !== null && !unsaved.value);
  const canSave = computed(() => !saving.value && !saved.value && isExportable(workout.value, invalidCells.value));

  const clearHooks: (() => void)[] = [];

  /** Runs `hook` whenever the open workout is cleared, for state kept elsewhere that belongs to it. */
  function onClear(hook: () => void) {
    clearHooks.push(hook);
  }

  function clear() {
    for (const url of photoUrls.value) URL.revokeObjectURL(url);
    photoUrls.value = [];
    for (const hook of clearHooks) hook();
    historyId.value = null;
    savedKey.value = null;
    savedRevision.value = null;
    reviewOrigin.value = 'capture';
    workout.value = null;
    extraColumn.value = null;
    rawText.value = '';
    notice.value = '';
    extraImages.value = 0;
    computedSummary.value = false;
  }

  function startEntry() {
    historyId.value = crypto.randomUUID();
  }

  /** The saved entry with `id`, as a copy safe to edit, once history has loaded. */
  async function findEntry(id: string): Promise<{ entry: HistoryEntry; revision: string } | null> {
    await readyHistory;
    const savedEntry = history.value.find((item) => item.id === id);
    const entry = savedEntry && parseEntry(JSON.parse(JSON.stringify(savedEntry)));
    return entry ? { entry, revision: savedEntry.revision } : null;
  }

  function applyEntry({ entry, revision }: { entry: HistoryEntry; revision: string }) {
    reviewOrigin.value = 'history';
    historyId.value = entry.id;
    workout.value = entry.workout;
    extraColumn.value = entry.extraColumn;
    savedRevision.value = revision;
    savedKey.value = draftKey(entry.workout, entry.extraColumn);
  }

  /**
   * Saves the open workout. Returns the saved id when the review screen still shows it,
   * so the caller can update the address.
   */
  async function save(): Promise<string | null> {
    const w = workout.value;
    const id = historyId.value;
    if (saving.value || !id || !w || !isExportable(w, invalidCells.value)) return null;
    const base = savedRevision.value;
    const data = draftKey(w, extraColumn.value);
    const entry = parseEntry({ id, ...JSON.parse(data) })!;
    saving.value = true;
    if (notice.value === t('sync.deletedEdit')) notice.value = '';
    try {
      await readyHistory;
      const result = await repository.save(entry, base);
      let shownId: string | null = null;
      if (historyId.value === id && stage.value === 'review') {
        if (!result) {
          notice.value = t('sync.deletedEdit');
          return null;
        }
        historyId.value = result.id;
        savedRevision.value = result.revision;
        savedKey.value = data;
        reviewOrigin.value = 'history';
        shownId = result.id;
      }
      storageError.value = false;
      void syncNow();
      return shownId;
    } catch {
      storageError.value = true;
      return null;
    } finally {
      saving.value = false;
    }
  }

  function confirmDiscard(): Promise<boolean> {
    return confirmDialog(savedKey.value === null ? 'discardNew' : 'discardChanges');
  }

  // Undo and redo, per workout: opening another workout starts a fresh stack.
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

  const undo = () => applyUndo(undoStack.undo());
  const redo = () => applyUndo(undoStack.redo());

  // The draft: the open workout survives a reload of the review screen.
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

  function findDraft(id: string | null): Draft | null {
    return (session && loadDraft(session, id)) || null;
  }

  function applyDraft(draft: Draft) {
    historyId.value = draft.id;
    workout.value = draft.workout;
    extraColumn.value = draft.extraColumn;
    savedKey.value = draft.savedKey;
    const existing = history.value.find((entry) => entry.id === draft.id);
    savedRevision.value =
      draft.revision ?? (existing && draftKey(existing.workout, existing.extraColumn) === draft.savedKey ? existing.revision : null);
    reviewOrigin.value = draft.origin;
    rawText.value = draft.rawText;
    notice.value = draft.notice;
    computedSummary.value = draft.computedSummary;
  }

  return {
    workout,
    extraColumn,
    historyId,
    savedKey,
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
    onClear,
    clear,
    startEntry,
    findEntry,
    applyEntry,
    findDraft,
    applyDraft,
    save,
    confirmDiscard,
    undo,
    redo,
  };
}

export type ReviewSession = ReturnType<typeof useReviewSession>;
