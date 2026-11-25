<script setup lang="ts">
import MdIcon from 'm3-vue/components/MdIcon.vue';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  approveInvite, claimInvite, closeInvite, createInvite, createVault, deleteVault, inviteCode, listDevices,
  recoverVault, revokeDevice, SyncError, type Invite,
} from '../sync/client';
import type { Device, HistoryStore } from '../sync/store';
import type { IconName } from '../ui/icons';
import CameraCapture from './CameraCapture.vue';
import { decodeQr } from './qrScan';

const props = defineProps<{
  store: HistoryStore;
  device: Device | null;
  pending: number;
  status: string;
  incoming: string;
  confirm: (key: string) => Promise<boolean>;
}>();
const emit = defineEmits<{ sync: []; dismiss: [] }>();
const { t, locale } = useI18n();
const busy = ref(false);
const message = ref('');
const error = ref('');
const code = ref('');
const recovery = ref('');
const recoveryKey = ref('');
const devices = ref<Awaited<ReturnType<typeof listDevices>>>([]);
const invite = shallowRef<Invite | null>(null);
const qr = ref('');
const linkCode = computed(() => invite.value ? inviteCode(invite.value) : '');
const STATUS_ICONS: Record<string, IconName> = {
  synced: 'cloud_done',
  syncing: 'cloud_sync',
  waiting: 'cloud_sync',
  offline: 'cloud_off',
};
const statusIcon = computed<IconName>(() => STATUS_ICONS[props.status] ?? 'sync_problem');
let poll: number | undefined;
let active = true;

watch(() => props.incoming, (value) => {
  if (value) code.value = value;
}, { immediate: true });

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof SyncError && [400, 401, 404, 409].includes(cause.status) ? 'requestRejected' :
      cause instanceof SyncError && cause.status === 429 ? 'requestLimited' : 'requestFailed';
  } finally {
    busy.value = false;
  }
}

function enable() {
  return run(async () => {
    recoveryKey.value = await createVault(props.store);
    emit('sync');
  });
}

function restore() {
  return run(async () => {
    await recoverVault(props.store, recovery.value);
    recovery.value = '';
    emit('sync');
  });
}

function startLink() {
  return run(async () => {
    const { toDataURL } = await import('qrcode');
    const pairing = await createInvite();
    const url = new URL(location.href);
    url.hash = 'link/' + inviteCode(pairing);
    const image = await toDataURL(url.href, { width: 228, margin: 3 });
    if (!active) {
      await closeInvite(pairing);
      return;
    }
    invite.value = pairing;
    qr.value = image;
    schedulePoll(pairing);
  });
}

function clearInvite() {
  window.clearTimeout(poll);
  const current = invite.value;
  invite.value = null;
  qr.value = '';
  return current;
}

function schedulePoll(pairing: Invite) {
  if (active && invite.value === pairing) poll = window.setTimeout(() => void claim(pairing), 1800);
}

async function claim(pairing: Invite) {
  if (Date.now() >= pairing.expires) {
    clearInvite();
    error.value = 'inviteExpired';
    return;
  }
  try {
    const newDevice = await claimInvite(pairing);
    if (!active || invite.value !== pairing) return;
    if (!newDevice) {
      schedulePoll(pairing);
      return;
    }
    await props.store.attach(newDevice);
    clearInvite();
    void closeInvite(pairing).catch(() => {});
    emit('sync');
  } catch (cause) {
    if (!active || invite.value !== pairing) return;
    if (cause instanceof SyncError && cause.status === 404) {
      clearInvite();
      error.value = 'inviteExpired';
    } else {
      schedulePoll(pairing);
    }
  }
}

function cancelLink() {
  const pairing = clearInvite();
  if (pairing) void closeInvite(pairing).catch(() => {});
}

function approve() {
  const device = props.device;
  if (!device) return;
  return run(async () => {
    const value = code.value.trim().replace(/^.*#link\//, '');
    if (!(await props.confirm('syncApprove'))) return;
    await approveInvite(device, value);
    code.value = '';
    emit('dismiss');
    message.value = 'approved';
  });
}

async function readQr(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await run(async () => {
    const image = await createImageBitmap(file);
    try {
      const text = await decodeQr(image, { x: 0, y: 0, width: image.width, height: image.height });
      if (text) code.value = text;
      else error.value = 'qrFailed';
    } finally {
      image.close();
    }
  });
}

/** The live camera reads the pairing QR code, as on the scan screen; the photo picker stays as the fallback. */
const cameraSupported = typeof navigator.mediaDevices?.getUserMedia === 'function';
const scanning = ref(false);
const cameraError = ref('');
const qrFile = ref<HTMLInputElement | null>(null);

function openScanner() {
  error.value = '';
  message.value = '';
  cameraError.value = '';
  scanning.value = true;
}

function onScanned(text: string) {
  scanning.value = false;
  code.value = text;
}

function onScannerFailed(reason: string) {
  scanning.value = false;
  cameraError.value = reason;
}

function chooseQrImage() {
  scanning.value = false;
  qrFile.value?.click();
}

function loadDevices() {
  const device = props.device;
  if (device) return run(async () => { devices.value = await listDevices(device); });
}

function revoke(id: string) {
  const device = props.device;
  if (!device) return;
  return run(async () => {
    if (!(await props.confirm('syncRevoke'))) return;
    await revokeDevice(device, id);
    devices.value = devices.value.filter((item) => item.id !== id);
  });
}

function disconnect() {
  const device = props.device;
  if (!device) return;
  return run(async () => {
    if (!(await props.confirm('syncDisconnect'))) return;
    if (navigator.onLine) await revokeDevice(device, device.id).catch(() => {});
    await props.store.detach(device.token);
    recoveryKey.value = '';
    devices.value = [];
  });
}

function erase() {
  const device = props.device;
  if (!device) return;
  return run(async () => {
    if (!(await props.confirm('syncErase'))) return;
    await deleteVault(device);
    await props.store.detach(device.token);
    recoveryKey.value = '';
    devices.value = [];
    message.value = 'erased';
  });
}

onBeforeUnmount(() => {
  active = false;
  cancelLink();
});
</script>

<template>
  <div class="settings-section">
    <h2 class="group-header">{{ t('sync.title') }}</h2>
    <p v-if="error" class="banner banner-error" role="alert">{{ t('sync.' + error) }}</p>
    <p v-if="message" class="banner" role="status">{{ t('sync.' + message) }}</p>
    <p v-if="!device && incoming" class="banner" role="status">{{ t('sync.needLinked') }}</p>

    <div class="group">
      <p class="group-row sync-supporting">{{ t('sync.detail') }}</p>

      <template v-if="!device">
        <template v-if="!invite">
          <button type="button" class="group-row tappable" :disabled="busy" @click="enable">
            <MdIcon name="cloud_sync" class="row-icon" />
            <span class="row-label">{{ t('sync.enable') }}</span>
          </button>
          <button type="button" class="group-row tappable" :disabled="busy" @click="startLink">
            <MdIcon name="link" class="row-icon" />
            <span class="row-label">{{ t('sync.link') }}</span>
          </button>
          <form class="group-row stacked" @submit.prevent="restore">
            <label class="sync-field">
              <span class="sync-field-head">
                <MdIcon name="key" class="row-icon" />
                <span class="row-label">{{ t('sync.recoveryCode') }}</span>
              </span>
              <input v-model="recovery" type="password" autocomplete="off" spellcheck="false" />
            </label>
            <div class="sync-buttons">
              <button class="tonal" :disabled="busy || !recovery.trim()">{{ t('sync.recover') }}</button>
            </div>
          </form>
        </template>

        <div v-else class="group-row stacked">
          <span class="sync-field-head">
            <MdIcon name="link" class="row-icon" />
            <span class="row-label">
              {{ t('sync.link') }}
              <span class="row-detail">{{ t('sync.scan') }}</span>
            </span>
          </span>
          <img class="sync-qr" :src="qr" width="228" height="228" :alt="t('sync.qr')" />
          <label class="sync-field">
            <span class="sync-field-label">{{ t('sync.pairCode') }}</span>
            <input :value="linkCode" readonly @focus="($event.target as HTMLInputElement).select()" />
          </label>
          <div class="sync-buttons">
            <button type="button" @click="cancelLink">{{ t('sync.cancelLink') }}</button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="group-row" role="status">
          <MdIcon :name="statusIcon" class="row-icon" />
          <span class="row-label">
            {{ t('sync.state.' + status) }}
            <span v-if="pending" class="row-detail">{{ t('sync.pending', pending) }}</span>
          </span>
        </div>

        <div v-if="recoveryKey" class="group-row stacked">
          <span class="sync-field-head">
            <MdIcon name="key" class="row-icon" />
            <span class="row-label">
              {{ t('sync.recoveryCode') }}
              <span class="row-detail">{{ t('sync.keepRecovery') }}</span>
            </span>
          </span>
          <input :value="recoveryKey" :aria-label="t('sync.recoveryCode')" readonly @focus="($event.target as HTMLInputElement).select()" />
          <div class="sync-buttons">
            <a
              class="button tonal tappable"
              :href="'data:text/plain;charset=utf-8,' + encodeURIComponent(recoveryKey)"
              download="ergscan-recovery.txt"
            ><MdIcon name="download" />{{ t('sync.downloadRecovery') }}</a>
          </div>
        </div>

        <form class="group-row stacked" @submit.prevent="approve">
          <label class="sync-field">
            <span class="sync-field-head">
              <MdIcon name="devices" class="row-icon" />
              <span class="row-label">{{ t('sync.pairCode') }}</span>
            </span>
            <input v-model="code" autocomplete="off" spellcheck="false" />
          </label>
          <p v-if="cameraError" class="banner banner-error" role="alert">{{ cameraError }}</p>
          <div class="sync-buttons">
            <button v-if="cameraSupported && !cameraError" type="button" class="tonal" :disabled="busy" @click="openScanner">
              <MdIcon name="qr_code_scanner" />
              {{ t('sync.scanQr') }}
            </button>
            <label class="button tonal tappable sync-file" :class="{ disabled: busy, 'sync-file-hidden': cameraSupported && !cameraError }">
              <MdIcon name="qr_code_scanner" />
              {{ t('sync.readQr') }}
              <input ref="qrFile" type="file" accept="image/*" capture="environment" :disabled="busy" @change="readQr" />
            </label>
            <button class="primary" :disabled="busy || !code.trim()">{{ t('sync.approve') }}</button>
          </div>
        </form>

        <button type="button" class="group-row tappable" :disabled="status === 'syncing'" @click="emit('sync')">
          <MdIcon name="sync" class="row-icon" />
          <span class="row-label">{{ t('sync.now') }}</span>
        </button>
        <button type="button" class="group-row tappable" :disabled="busy" @click="loadDevices">
          <MdIcon name="devices" class="row-icon" />
          <span class="row-label">{{ t('sync.devices') }}</span>
        </button>
        <div v-for="item in devices" :key="item.id" class="group-row sync-device">
          <span class="row-label">
            {{ item.id === device.id ? t('sync.thisDevice') : t('sync.otherDevice', { id: item.id.slice(0, 8) }) }}
            <span class="row-detail">{{ new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(item.linkedAt) }}</span>
          </span>
          <button v-if="item.id !== device.id" type="button" :disabled="busy" @click="revoke(item.id)">{{ t('sync.revoke') }}</button>
        </div>
        <button type="button" class="group-row tappable" :disabled="busy" @click="disconnect">
          <MdIcon name="link_off" class="row-icon" />
          <span class="row-label">{{ t('sync.disconnect') }}</span>
        </button>
        <button type="button" class="group-row tappable settings-danger" :disabled="busy" @click="erase">
          <MdIcon name="delete_forever" class="row-icon" />
          <span class="row-label">{{ t('sync.erase') }}</span>
        </button>
      </template>
    </div>

    <Teleport to="body">
      <CameraCapture
        v-if="scanning"
        mode="qr"
        @qr="onScanned"
        @cancel="scanning = false"
        @choose="chooseQrImage"
        @failed="onScannerFailed"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.sync-supporting {
  min-height: 0;
  padding-block: 16px;
  color: var(--on-surface-variant);
  font: var(--body-medium);
}

.sync-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sync-field-head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.sync-field-label {
  color: var(--on-surface-variant);
  font: var(--body-small);
}

.sync-field input,
.group-row.stacked > input {
  width: 100%;
  font-family: ui-monospace, monospace;
}

.sync-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.sync-buttons .button {
  text-decoration: none;
  text-align: center;
}

.sync-buttons .button svg,
.sync-buttons button svg {
  width: 18px;
  height: 18px;
  flex: none;
}

.sync-file {
  position: relative;
  cursor: pointer;
}

.sync-file input {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  padding: 0;
  opacity: 0;
  pointer-events: none;
}

.sync-file:focus-within {
  outline: 3px solid var(--secondary);
  outline-offset: 2px;
}

/* Kept in the page so the camera's "choose a photo" fallback can open its picker. */
.sync-file-hidden {
  display: none;
}

.sync-file.disabled {
  background-color: color-mix(in srgb, var(--on-surface) 12%, transparent);
  color: color-mix(in srgb, var(--on-surface) 38%, transparent);
  pointer-events: none;
}

.sync-qr {
  align-self: center;
  max-width: 100%;
  height: auto;
  border-radius: var(--shape-medium);
  background: #fff;
}

.sync-device {
  padding-inline-start: 72px;
}

.group-row.tappable:disabled .row-icon {
  opacity: 0.38;
}
</style>
