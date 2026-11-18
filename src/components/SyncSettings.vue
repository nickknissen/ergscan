<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  approveInvite, claimInvite, closeInvite, createInvite, createVault, deleteVault, inviteCode, listDevices,
  recoverVault, revokeDevice, SyncError, type Invite,
} from '../sync/client';
import type { Device, HistoryStore } from '../sync/store';

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
    error.value = cause instanceof SyncError && [400, 401, 404, 409].includes(cause.status) ?
      'requestRejected' : 'requestFailed';
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
    const { default: jsQR } = await import('jsqr');
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context?.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const pixels = context?.getImageData(0, 0, canvas.width, canvas.height);
    const result = pixels && jsQR(pixels.data, pixels.width, pixels.height);
    if (result?.data) code.value = result.data;
    else error.value = 'qrFailed';
  });
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
    <div class="group sync-settings">
      <p>{{ t('sync.detail') }}</p>
      <p v-if="device" role="status">
        {{ t('sync.state.' + status) }}
        <span v-if="pending">{{ t('sync.pending', pending) }}</span>
      </p>
      <p v-if="error" class="banner banner-error" role="alert">{{ t('sync.' + error) }}</p>
      <p v-if="message" role="status">{{ t('sync.' + message) }}</p>

      <template v-if="!device">
        <p v-if="incoming" role="status">{{ t('sync.needLinked') }}</p>
        <div v-if="!invite" class="sync-actions">
          <button type="button" :disabled="busy" @click="enable">{{ t('sync.enable') }}</button>
          <button type="button" :disabled="busy" @click="startLink">{{ t('sync.link') }}</button>
        </div>
        <template v-if="invite">
          <p>{{ t('sync.scan') }}</p>
          <img :src="qr" width="228" height="228" :alt="t('sync.qr')" />
          <label>{{ t('sync.pairCode') }} <input :value="linkCode" readonly @focus="($event.target as HTMLInputElement).select()" /></label>
          <button type="button" @click="cancelLink">{{ t('sync.cancelLink') }}</button>
        </template>
        <form v-else class="sync-form" @submit.prevent="restore">
          <label>{{ t('sync.recoveryCode') }} <input v-model="recovery" type="password" autocomplete="off" spellcheck="false" /></label>
          <button :disabled="busy || !recovery.trim()">{{ t('sync.recover') }}</button>
        </form>
      </template>

      <template v-else>
        <div v-if="recoveryKey" class="sync-form">
          <p>{{ t('sync.keepRecovery') }}</p>
          <label>{{ t('sync.recoveryCode') }} <input :value="recoveryKey" readonly @focus="($event.target as HTMLInputElement).select()" /></label>
          <a :href="'data:text/plain;charset=utf-8,' + encodeURIComponent(recoveryKey)" download="ergscan-recovery.txt">{{ t('sync.downloadRecovery') }}</a>
        </div>
        <form class="sync-form" @submit.prevent="approve">
          <label>{{ t('sync.pairCode') }} <input v-model="code" autocomplete="off" spellcheck="false" /></label>
          <label class="sync-file">{{ t('sync.readQr') }} <input type="file" accept="image/*" capture="environment" :disabled="busy" @change="readQr" /></label>
          <button :disabled="busy || !code.trim()">{{ t('sync.approve') }}</button>
        </form>
        <div class="sync-actions">
          <button type="button" :disabled="status === 'syncing'" @click="emit('sync')">{{ t('sync.now') }}</button>
          <button type="button" :disabled="busy" @click="loadDevices">{{ t('sync.devices') }}</button>
          <button type="button" :disabled="busy" @click="disconnect">{{ t('sync.disconnect') }}</button>
          <button type="button" class="settings-danger" :disabled="busy" @click="erase">{{ t('sync.erase') }}</button>
        </div>
        <ul v-if="devices.length" class="sync-devices">
          <li v-for="item in devices" :key="item.id">
            <span>{{ item.id === device.id ? t('sync.thisDevice') : t('sync.otherDevice', { id: item.id.slice(0, 8) }) }}
              · {{ new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(item.linkedAt) }}</span>
            <button v-if="item.id !== device.id" type="button" :disabled="busy" @click="revoke(item.id)">{{ t('sync.revoke') }}</button>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sync-settings, .sync-form {
  display: grid;
  gap: 0.65rem;
  justify-items: start;
}
.sync-settings { padding: 1rem; }
.sync-settings p, .sync-devices { margin: 0; }
.sync-settings label { display: grid; gap: 0.3rem; }
.sync-settings input { max-width: 100%; font: inherit; }
.sync-settings img { max-width: 100%; height: auto; }
.sync-actions, .sync-devices li { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.sync-devices { padding-inline-start: 1rem; }
.sync-settings button {
  border: 1px solid currentColor;
  border-radius: 1rem;
  padding: 0.45rem 0.8rem;
  color: inherit;
  background: transparent;
  font: inherit;
}
</style>
