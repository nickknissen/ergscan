<script setup lang="ts">
import MdIcon from '@nickknissen/m3-vue/components/MdIcon.vue';
import { handleRadioKeydown } from '@nickknissen/m3-vue/ui/keyboardNav';
import { computed, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import SyncSettings from '../components/SyncSettings.vue';
import { ACCENTS, accentSwatch, type Accent } from '@nickknissen/m3-vue/ui/palette';
import { estimatedMaxHeartRate, parseWholeNumber, THEMES, type HeartRateSettings, type Theme } from '../core/settings';
import type { Device, HistoryStore } from '../sync/store';

const theme = defineModel<Theme>('theme', { required: true });
const accent = defineModel<Accent>('accent', { required: true });
const showIntro = defineModel<boolean>('showIntro', { required: true });
const heartRate = defineModel<HeartRateSettings>('heartRate', { required: true });

/** `sync` is null when the deployment has no sync server. */
defineProps<{
  entryCount: number;
  linked: boolean;
  backupMessage: { error: boolean; text: string } | null;
  sync: {
    store: HistoryStore;
    device: Device | null;
    pending: number;
    status: string;
    incoming: string;
    confirm: (key: string) => Promise<boolean>;
  } | null;
}>();
const emit = defineEmits<{ syncNow: []; dismissPair: []; clear: []; exportHistory: []; restoreHistory: [file: File] }>();
const { t } = useI18n();

const restoreInput = useTemplateRef<HTMLInputElement>('restoreInput');

function pickBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Clear it so picking the same file again still restores.
  input.value = '';
  if (file) emit('restoreHistory', file);
}

const swatches = ACCENTS.map((option) => ({ option, colors: accentSwatch(option) }));
const ageEstimate = computed(() => (heartRate.value.age === null ? null : estimatedMaxHeartRate(heartRate.value.age)));

const ageDetail = computed(() => {
  if (heartRate.value.measuredMax !== null && heartRate.value.age !== null) return t('settings.ageUnused');
  return ageEstimate.value === null ? t('settings.ageDetail') : t('settings.ageEstimate', { bpm: ageEstimate.value });
});

function setHeartRate(key: keyof HeartRateSettings, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = parseWholeNumber(input.value);
  const next = value !== null || input.value.trim() === '' ? { ...heartRate.value, [key]: value } : heartRate.value;
  if (next !== heartRate.value) heartRate.value = next;
  // The model updates once the parent re-renders, so show what was stored, not the raw text.
  input.value = String(next[key] ?? '');
}
</script>

<template>
  <section class="settings">
    <div class="settings-section">
      <h2 class="group-header">{{ t('settings.appearance') }}</h2>
      <div class="group">
        <div class="group-row settings-theme">
          <MdIcon name="contrast" class="row-icon" />
          <span class="row-label">{{ t('settings.theme') }}</span>
          <div
            class="segmented"
            role="radiogroup"
            :aria-label="t('settings.theme')"
            @keydown="handleRadioKeydown($event, THEMES, theme, (value) => (theme = value))"
          >
            <button
              v-for="option in THEMES"
              :key="option"
              type="button"
              role="radio"
              :aria-checked="theme === option"
              :tabindex="theme === option ? 0 : -1"
              @click="theme = option"
            >
              <MdIcon v-if="theme === option" name="check" />
              {{ t(`settings.themes.${option}`) }}
            </button>
          </div>
        </div>
        <div class="group-row settings-theme">
          <MdIcon name="palette" class="row-icon" />
          <span class="row-label">{{ t('settings.color') }}</span>
          <div
            class="swatches"
            role="radiogroup"
            :aria-label="t('settings.color')"
            @keydown="handleRadioKeydown($event, ACCENTS, accent, (value) => (accent = value))"
          >
            <button
              v-for="{ option, colors } in swatches"
              :key="option"
              type="button"
              role="radio"
              class="swatch"
              :aria-checked="accent === option"
              :tabindex="accent === option ? 0 : -1"
              :aria-label="t(`settings.accents.${option}`)"
              :title="t(`settings.accents.${option}`)"
              :style="{ '--swatch-1': colors[0], '--swatch-2': colors[1], '--swatch-3': colors[2] }"
              @click="accent = option"
            >
              <MdIcon v-if="accent === option" name="check" />
            </button>
          </div>
        </div>
        <label class="group-row tappable">
          <MdIcon name="view_day" class="row-icon" />
          <span class="row-label">
            {{ t('settings.showIntro') }}
            <span class="row-detail">{{ t('settings.showIntroDetail') }}</span>
          </span>
          <input v-model="showIntro" type="checkbox" role="switch" class="switch" />
        </label>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="group-header">{{ t('settings.heartRate') }}</h2>
      <div class="group">
        <label class="group-row">
          <MdIcon name="monitor_heart" class="row-icon" />
          <span class="row-label">
            {{ t('settings.maxHr') }}
            <span class="row-detail">{{ t('settings.maxHrDetail') }}</span>
          </span>
          <input
            :value="heartRate.measuredMax ?? ''"
            class="settings-number"
            inputmode="numeric"
            autocomplete="off"
            :placeholder="ageEstimate === null ? undefined : String(ageEstimate)"
            @change="setHeartRate('measuredMax', $event)"
          />
        </label>
        <label class="group-row">
          <MdIcon name="cake" class="row-icon" />
          <span class="row-label">
            {{ t('settings.age') }}
            <span class="row-detail">{{ ageDetail }}</span>
          </span>
          <input
            :value="heartRate.age ?? ''"
            class="settings-number"
            inputmode="numeric"
            autocomplete="off"
            @change="setHeartRate('age', $event)"
          />
        </label>
      </div>

      <SyncSettings
        v-if="sync" :store="sync.store" :device="sync.device" :pending="sync.pending" :status="sync.status"
        :incoming="sync.incoming" :confirm="sync.confirm" @sync="emit('syncNow')" @dismiss="emit('dismissPair')"
      />

      <h2 class="group-header">{{ t('settings.data') }}</h2>
      <p v-if="backupMessage" class="banner" :class="{ 'banner-error': backupMessage.error }" :role="backupMessage.error ? 'alert' : 'status'">
        {{ backupMessage.text }}
      </p>
      <div class="group">
        <button type="button" class="group-row tappable" :disabled="entryCount === 0" @click="emit('exportHistory')">
          <MdIcon name="download" class="row-icon" />
          <span class="row-label">
            {{ t('settings.export') }}
            <span class="row-detail">{{ t('settings.exportDetail', entryCount) }}</span>
          </span>
        </button>
        <button type="button" class="group-row tappable" @click="restoreInput?.click()">
          <MdIcon name="upload" class="row-icon" />
          <span class="row-label">
            {{ t('settings.restore') }}
            <span class="row-detail">{{ t('settings.restoreDetail') }}</span>
          </span>
        </button>
        <input ref="restoreInput" type="file" accept=".json,application/json" hidden @change="pickBackup" />
        <button type="button" class="group-row tappable settings-danger" @click="emit('clear')">
          <MdIcon name="delete_forever" class="row-icon" />
          <span class="row-label">
            {{ t(linked ? 'sync.clearDevice' : 'settings.clear') }}
            <span class="row-detail">{{ t('settings.clearDetail', entryCount) }}</span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>
