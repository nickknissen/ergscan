import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { fitFileName } from '../core/dates';
import { isExportable, type Workout } from '../core/workout';
import { downloadUrlData } from '../ui/imageInput';
import { saveFile } from '../ui/saveFile';

type FitModule = typeof import('../core/fitExport');

/**
 * Saving, sharing and dragging out the workout as a FIT file. The encoder is loaded the first
 * time the review screen opens. `savedAs` names the file last saved, for the review screen to show.
 */
export function useFitExport(options: { workout: Ref<Workout | null>; invalidCells: Ref<number>; stage: Ref<string> }) {
  const { workout, invalidCells, stage } = options;
  const fitModule = shallowRef<FitModule | null>(null);
  const savedAs = ref('');

  watch(stage, (value) => {
    if (value === 'review' && !fitModule.value) void import('../core/fitExport').then((m) => (fitModule.value = m));
  });

  const canExport = computed(() => Boolean(fitModule.value) && isExportable(workout.value, invalidCells.value));
  const canShare = computed(() => typeof navigator.canShare === 'function');

  function fitFile(): File {
    const w = workout.value!;
    const bytes = fitModule.value!.workoutToFit(w);
    return new File([bytes.slice().buffer], fitFileName(w.startTime), { type: 'application/vnd.ant.fit' });
  }

  async function download() {
    const name = await saveFile(fitFile(), { description: 'FIT', extension: '.fit' });
    if (name !== null) savedAs.value = name;
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

  return { savedAs, canExport, canShare, download, share, dragFit };
}
