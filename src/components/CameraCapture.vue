<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { captureRect, guideRectInView, type Size } from '../ocr/guide';
import { CAMERA_KEY, lostChosenCamera, nextCamera, videoConstraints, videoInputs } from './cameraChoice';
import { cameraFailure } from './cameraFailure';
import MdIcon from './MdIcon.vue';

const emit = defineEmits<{
  capture: [image: Blob];
  cancel: [];
  choose: [];
  failed: [message: string];
}>();

const START_TIMEOUT_MS = 10_000;

const { t } = useI18n();

const container = ref<HTMLDivElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const view = ref<Size>({ width: 0, height: 0 });
const state = ref<'starting' | 'ready' | 'stalled' | 'lost'>('starting');
const ready = computed(() => state.value === 'ready');
let stream: MediaStream | null = null;
let observer: ResizeObserver | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;

const guideStyle = computed(() => {
  const g = guideRectInView(view.value);
  return { left: `${g.x}px`, top: `${g.y}px`, width: `${g.width}px`, height: `${g.height}px` };
});

function failureMessage(error: unknown): string {
  const { key, message } = cameraFailure(error);
  return t(key, { message });
}

function stop() {
  clearTimeout(timeout);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function start() {
  stop();
  const current = ++attempt;
  state.value = 'starting';
  timeout = setTimeout(() => {
    if (current === attempt && state.value === 'starting') state.value = 'stalled';
  }, START_TIMEOUT_MS);
  const chosen = chosenCamera();
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints(chosen) });
    if (current !== attempt) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = media;
    cameraId.value = media.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    void refreshCameras();
    media.getVideoTracks().forEach((track) =>
      track.addEventListener('ended', () => {
        if (current !== attempt) return;
        stop();
        state.value = 'lost';
      }),
    );
    video.value!.srcObject = stream;
    await video.value!.play();
    clearTimeout(timeout);
    state.value = 'ready';
  } catch (error) {
    if (current !== attempt) return;
    stop();
    if (lostChosenCamera(error, chosen)) {
      chooseCamera(null);
      void start();
      return;
    }
    emit('failed', failureMessage(error));
  }
}

const cameras = ref<MediaDeviceInfo[]>([]);
const cameraId = ref<string | null>(null);

function chosenCamera(): string | null {
  try {
    return sessionStorage.getItem(CAMERA_KEY);
  } catch {
    return null;
  }
}

function chooseCamera(id: string | null) {
  try {
    if (id) sessionStorage.setItem(CAMERA_KEY, id);
    else sessionStorage.removeItem(CAMERA_KEY);
  } catch {
    // Storage unavailable: the switch still applies until the camera closes.
  }
}

async function refreshCameras() {
  cameras.value = videoInputs(await navigator.mediaDevices.enumerateDevices());
}

function switchCamera() {
  const next = nextCamera(cameras.value, cameraId.value);
  if (!next) return;
  chooseCamera(next);
  void start();
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    attempt++;
    stop();
  } else if (!stream) {
    void start();
  }
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) view.value = { width: entry.contentRect.width, height: entry.contentRect.height };
  });
  if (container.value) observer.observe(container.value);
  document.addEventListener('visibilitychange', onVisibilityChange);
  navigator.mediaDevices.addEventListener('devicechange', refreshCameras);
  void start();
});

onBeforeUnmount(() => {
  attempt++;
  observer?.disconnect();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  navigator.mediaDevices.removeEventListener('devicechange', refreshCameras);
  stop();
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
        <p v-if="ready" class="guide-hint">{{ t('camera.hint') }}</p>
      </div>
      <div v-if="!ready" class="camera-status" role="status">
        <template v-if="state === 'starting'">
          <svg class="spinner" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" /></svg>
          <p>{{ t('camera.starting') }}</p>
        </template>
        <template v-else>
          <p>{{ t(state === 'lost' ? 'camera.busy' : 'camera.stalled') }}</p>
          <div class="camera-status-actions">
            <button type="button" class="primary" @click="start">{{ t('camera.retry') }}</button>
            <button type="button" class="tonal" @click="emit('choose')">{{ t('capture.chooseImage') }}</button>
          </div>
        </template>
      </div>
    </div>
    <div class="camera-actions">
      <button type="button" class="camera-cancel" @click="emit('cancel')">{{ t('camera.cancel') }}</button>
      <button type="button" class="shutter" :disabled="!ready" :aria-label="t('camera.capture')" :title="t('camera.capture')" @click="capture"></button>
      <button
        v-if="cameras.length > 1"
        type="button"
        class="icon camera-switch"
        :aria-label="t('camera.switch')"
        :title="t('camera.switch')"
        @click="switchCamera"
      >
        <MdIcon name="cameraswitch" />
      </button>
      <span v-else class="spacer"></span>
    </div>
  </section>
</template>
