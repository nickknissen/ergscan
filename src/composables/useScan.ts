import { computed, ref, shallowRef } from 'vue';
import { startTimeFor } from '../core/dates';
import type { ParsedScan } from '../core/pm5Parser';
import { mergeScans, rowsMissing, withAddedRows } from '../core/scanMerge';
import { newWorkout } from '../core/workout';
import type { ScanOutcome } from '../ocr/firstParsed';
import { scanFailure } from '../ocr/scanFailure';
import { buzz } from '../ui/haptics';
import { pickImage } from '../ui/imageInput';
import type { Navigation } from './useNavigation';
import type { ReviewSession } from './useReviewSession';

/**
 * Turning photos into a workout: reading an image, opening the camera, and adding the rows of a
 * second photo to the open workout when the first did not show them all (`moreRows`).
 */
export function useScan(options: {
  nav: Navigation;
  review: ReviewSession;
  t: (key: string, params?: Record<string, unknown>) => string;
  pickPhoto: () => void;
}) {
  const { nav, review, t, pickPhoto } = options;
  const { workout, extraColumn, photoUrls, rawText, notice, computedSummary } = review;

  const scanSoFar = shallowRef<ParsedScan | null>(null);
  let addingRows = false;
  const progressText = ref('');
  const progress = ref<number | null>(null);
  const cameraSupported = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const cameraError = ref('');

  review.onClear(() => {
    scanSoFar.value = null;
    addingRows = false;
  });

  const moreRows = computed(() => {
    const scan = scanSoFar.value;
    const w = workout.value;
    return scan !== null && w !== null && rowsMissing({ summaryFromScreen: scan.summaryFromScreen, summary: w.summary, rows: w.rows });
  });

  function openCamera() {
    cameraError.value = '';
    nav.show('camera');
  }

  function closeCamera() {
    nav.show(addingRows ? 'review' : 'capture');
    addingRows = false;
  }

  function onCameraFailed(message: string) {
    if (addingRows) notice.value = message;
    else cameraError.value = message;
    closeCamera();
  }

  function stopAddingRows() {
    addingRows = false;
  }

  function scanMoreRows() {
    addingRows = true;
    if (cameraSupported) openCamera();
    else pickPhoto();
  }

  async function readImage(image: Blob, framed: boolean): Promise<ScanOutcome> {
    nav.show('scanning');
    progressText.value = t('scan.loading');
    progress.value = null;
    const { scanImage } = await import('../ocr/scan');
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
    buzz(notice.value ? 'unread' : 'read');
    nav.show('review');
  }

  /** Reads `image` into a new workout, or into the open one while adding rows. `framed`: taken in the app's camera frame. */
  async function scanBlob(image: Blob, photoTime: Date, framed: boolean) {
    const previous = addingRows ? scanSoFar.value : null;
    addingRows = false;
    if (previous && workout.value) return addRowsFrom(image, framed, previous);
    review.clear();
    review.startEntry();
    photoUrls.value = [URL.createObjectURL(image)];

    try {
      const outcome = await readImage(image, framed);
      rawText.value = outcome.text;
      if (outcome.scan) {
        const { scan } = outcome;
        scanSoFar.value = scan;
        const elapsedDs = scan.rows.length > 0 ? scan.rows.reduce((a, r) => a + (r.durationDs ?? 0), 0) : (scan.summary.durationDs ?? 0);
        const startTime = startTimeFor(scan.date, photoTime, elapsedDs);
        workout.value = { ...newWorkout(), startTime, splitDistance: scan.splitDistance, dragFactor: scan.dragFactor, summary: scan.summary, rows: scan.rows };
        extraColumn.value = scan.extraColumn;
        computedSummary.value = !scan.summaryFromScreen;
      } else {
        workout.value = { ...newWorkout(), startTime: photoTime };
        notice.value = t('scan.failed');
      }
    } catch (error) {
      workout.value = newWorkout();
      const { key, message } = scanFailure(error, navigator.onLine);
      notice.value = t(key, { message });
    }
    buzz(notice.value ? 'unread' : 'read');
    nav.showReview(null);
  }

  /** Scans the first image among `files`, noting how many others were left out. */
  async function scanPicked(files: File[]) {
    const picked = pickImage(files);
    if (!picked) return;
    await scanBlob(picked.file, new Date(picked.file.lastModified || Date.now()), false);
    if (picked.extra) review.extraImages.value = picked.extra;
  }

  /** `change` handler for the file inputs. */
  async function onImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await scanBlob(file, new Date(file.lastModified || Date.now()), false);
  }

  return {
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
  };
}
