import { ref, type Ref } from 'vue';
import { align, withWatchHeartRate } from '../core/watchHeartRate';
import type { ReviewSession } from './useReviewSession';

export interface WatchMessage {
  text: string;
  error: boolean;
}

/**
 * Adding heart rate to the open workout from a watch recording: a FIT file, or the ZIP from
 * Garmin Connect's "Export Original". The recording is lined up with the splits, and the result
 * is an ordinary edit, so undo takes it back.
 */
export function useWatchHeartRate(options: {
  review: ReviewSession;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: Ref<string>;
}) {
  const { review, t, locale } = options;
  const message = ref<WatchMessage | null>(null);
  const reading = ref(false);

  review.onClear(() => (message.value = null));

  async function addWatchFile(file: File) {
    const before = review.workout.value;
    if (!before || reading.value) return;
    reading.value = true;
    message.value = null;
    try {
      const { readWatchFile, WatchFileError } = await import('../core/watchFile');
      let recording;
      try {
        recording = await readWatchFile(new Uint8Array(await file.arrayBuffer()));
      } catch (error) {
        message.value = { text: t(`watch.${error instanceof WatchFileError ? error.problem : 'unreadable'}`), error: true };
        return;
      }
      // The workout may have been closed or replaced while the file was read.
      if (review.workout.value !== before) return;
      const alignment = align(before, recording);
      if (!alignment) {
        message.value = { text: t('watch.tooShort'), error: true };
        return;
      }
      const updated = withWatchHeartRate(before, recording, alignment);
      review.workout.value = updated;
      review.extraColumn.value ??= 'heartRate';
      const time = updated.startTime.toLocaleTimeString(locale.value, { timeStyle: 'medium' });
      message.value = { text: t(alignment.byStrokeRate ? 'watch.matched' : 'watch.matchedByStart', { time }), error: false };
    } finally {
      reading.value = false;
    }
  }

  /** `change` handler for the watch file input. */
  function onWatchFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void addWatchFile(file);
  }

  return { watchMessage: message, readingWatch: reading, addWatchFile, onWatchFile };
}
