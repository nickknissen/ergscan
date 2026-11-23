<script setup lang="ts">
import MdIcon from 'm3-vue/components/MdIcon.vue';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { captureRect, guideRectInView, type Size } from '../ocr/guide';
import { CAMERA_KEY, lostChosenCamera, nextCamera, videoConstraints, videoInputs } from './cameraChoice';
import { buzz } from '../ui/haptics';
import { cameraFailure } from './cameraFailure';
import { cameraDebug, cameraReport, reportAllCameras } from './cameraReport';
import { activeStop, clampZoom, createZoomApplier, pinchZoom, zoomRange, zoomStops, type ZoomRange } from './cameraZoom';

const emit = defineEmits<{
  capture: [image: Blob];
  cancel: [];
  choose: [];
  failed: [message: string];
}>();

const START_TIMEOUT_MS = 10_000;

const { t, locale } = useI18n();

const container = ref<HTMLDivElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const view = ref<Size>({ width: 0, height: 0 });
const state = ref<'starting' | 'ready' | 'stalled' | 'lost'>('starting');
const ready = computed(() => state.value === 'ready');
let stream: MediaStream | null = null;
let observer: ResizeObserver | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
const report = ref('');
let reportedAll = false;

/** Stops the preview, opens every camera in turn for the report, then starts the preview again. */
async function reportAll() {
  attempt++;
  stop();
  reportedAll = true;
  report.value = 'Reading every camera…';
  report.value = await reportAllCameras().catch((error: unknown) => String(error));
  void start();
}

async function shareReport() {
  try {
    if (navigator.share) await navigator.share({ title: 'ErgScan camera', text: report.value });
    else await navigator.clipboard.writeText(report.value);
  } catch {
    // Cancelled share sheet: the text is still on screen to select.
  }
}

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
  videoTrack = null;
  range.value = null;
  pointers.clear();
}

// ---------- Zoom: the camera's own zoom, by pinching the preview or tapping a chip ----------

let videoTrack: MediaStreamTrack | null = null;
const range = shallowRef<ZoomRange | null>(null);
const zoom = ref(1);
const stops = computed(() => (range.value ? zoomStops(range.value) : []));
const currentStop = computed(() => activeStop(zoom.value, stops.value));
const applyZoom = createZoomApplier(async (value) => {
  await videoTrack?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
});

function zoomLabel(value: number): string {
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value)}×`;
}

/** Reads what the new camera can zoom to, keeping the zoom it starts at. */
function readZoom(track: MediaStreamTrack) {
  videoTrack = track;
  range.value = zoomRange(typeof track.getCapabilities === 'function' ? track.getCapabilities() : null);
  const current = (track.getSettings() as { zoom?: number }).zoom;
  zoom.value = range.value ? clampZoom(current ?? range.value.min, range.value) : 1;
}

function setZoom(value: number) {
  if (!range.value) return;
  const next = clampZoom(value, range.value);
  if (next === zoom.value) return;
  zoom.value = next;
  applyZoom(next);
}

/** Fingers on the preview, by pointer id, and the spread and zoom when the second one went down. */
const pointers = new Map<number, { x: number; y: number }>();
let pinchStart: { distance: number; zoom: number } | null = null;

function spread(): number {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function onPointerDown(event: PointerEvent) {
  // A finger on a chip taps it; capturing it here would keep the click from the chip.
  if (!range.value || (event.target as Element).closest('button, .camera-report')) return;
  // Captured, so a finger that slides off the preview still reports lifting and isn't left in `pointers`.
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) pinchStart = { distance: spread(), zoom: zoom.value };
}

function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size !== 2 || !pinchStart || !range.value) return;
  const before = currentStop.value;
  setZoom(pinchZoom(pinchStart.zoom, pinchStart.distance, spread(), range.value));
  if (currentStop.value !== before) buzz('zoomStop');
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchStart = null;
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
    const track = media.getVideoTracks()[0];
    if (track) readZoom(track);
    if (cameraDebug && track && !reportedAll) report.value = cameraReport(track);
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
  buzz('shutter');
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
    <div
      ref="container"
      class="camera"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <video ref="video" muted playsinline autoplay></video>
      <div class="guide" :style="guideStyle">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
        <p v-if="ready" class="guide-hint">{{ t('camera.hint') }}</p>
      </div>
      <div v-if="ready && stops.length" class="zoom-stops">
        <button
          v-for="stop in stops"
          :key="stop"
          type="button"
          class="zoom-stop"
          :class="{ active: stop === currentStop }"
          :aria-label="t('camera.zoom', { level: zoomLabel(stop) })"
          :aria-pressed="stop === currentStop"
          @click="setZoom(stop)"
        >
          {{ stop === currentStop ? zoomLabel(zoom) : zoomLabel(stop) }}
        </button>
      </div>
      <div v-if="report" class="camera-report">
        <button type="button" class="tonal" @click="reportAll">All cameras</button>
        <button type="button" class="tonal" @click="shareReport">Share report</button>
        <pre>{{ report }}</pre>
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
