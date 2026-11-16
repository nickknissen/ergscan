<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { captureRect, guideRectInView, type Size } from '../ocr/guide';

const emit = defineEmits<{
  capture: [image: Blob];
  cancel: [];
  failed: [message: string];
}>();

const { t } = useI18n();

const container = ref<HTMLDivElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const view = ref<Size>({ width: 0, height: 0 });
const ready = ref(false);
let stream: MediaStream | null = null;
let observer: ResizeObserver | null = null;

const guideStyle = computed(() => {
  const g = guideRectInView(view.value);
  return { left: `${g.x}px`, top: `${g.y}px`, width: `${g.width}px`, height: `${g.height}px` };
});

onMounted(async () => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) view.value = { width: entry.contentRect.width, height: entry.contentRect.height };
  });
  if (container.value) observer.observe(container.value);
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
    });
    video.value!.srcObject = stream;
    await video.value!.play();
    ready.value = true;
  } catch (error) {
    emit('failed', error instanceof Error ? error.message : String(error));
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
});

function capture() {
  const v = video.value;
  if (!v || !ready.value) return;
  const rect = captureRect(view.value, { width: v.videoWidth, height: v.videoHeight });
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.getContext('2d')!.drawImage(v, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  canvas.toBlob((blob) => blob && emit('capture', blob), 'image/jpeg', 0.92);
}
</script>

<template>
  <section class="camera-step">
    <div ref="container" class="camera">
      <video ref="video" muted playsinline autoplay></video>
      <div class="guide" :style="guideStyle">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
        <p class="guide-hint">{{ t('camera.hint') }}</p>
      </div>
    </div>
    <div class="camera-actions">
      <button type="button" class="camera-cancel" @click="emit('cancel')">{{ t('camera.cancel') }}</button>
      <button type="button" class="shutter" :disabled="!ready" :aria-label="t('camera.capture')" @click="capture"></button>
      <span class="spacer"></span>
    </div>
  </section>
</template>
