import { onBeforeUnmount, onMounted, ref } from 'vue';
import { carriesFiles, pickImage } from '../ui/imageInput';
import { isTextField } from '../ui/shortcuts';

/**
 * Images that arrive without the file picker: dropped on the page, pasted, or opened with the
 * installed app from the system. `dragging` is true while files are dragged over the page.
 */
export function useImageInput(options: { acceptsImages: () => boolean; onFiles: (files: File[]) => Promise<void> }) {
  const { acceptsImages, onFiles } = options;
  const dragging = ref(false);

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
    void onFiles([...(event.dataTransfer?.files ?? [])]);
  }

  function onPaste(event: ClipboardEvent) {
    if (!acceptsImages() || isTextField(document.activeElement as HTMLInputElement | null)) return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!pickImage(files)) return;
    event.preventDefault();
    void onFiles(files);
  }

  const listeners = [
    ['dragover', onDragOver],
    ['dragleave', onDragLeave],
    ['drop', onDrop],
    ['paste', onPaste],
  ] as const;

  onMounted(() => {
    window.launchQueue?.setConsumer(async ({ files }) => {
      if (files.length) await onFiles(await Promise.all(files.map((handle) => handle.getFile())));
    });
    for (const [type, listener] of listeners) document.addEventListener(type, listener as EventListener);
  });
  onBeforeUnmount(() => {
    for (const [type, listener] of listeners) document.removeEventListener(type, listener as EventListener);
  });

  return { dragging };
}
