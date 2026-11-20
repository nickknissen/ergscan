<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { heartRateZones } from '../core/heartRate';
import { formatTime } from '../core/time';
import type { Workout } from '../core/workout';

const props = defineProps<{ workout: Workout; maxHr: number | null }>();

const { t } = useI18n();

const hasHeartRate = computed(() => [props.workout.summary, ...props.workout.rows].some((r) => !r.isRest && r.heartRate !== null));

const zones = computed(() => {
  if (props.maxHr === null) return null;
  const times = heartRateZones(props.workout, props.maxHr);
  const total = times.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return times.map((ds, index) => ({ number: index + 1, ds, percent: (ds / total) * 100 }));
});
</script>

<template>
  <section v-if="zones" class="zones">
    <h2 class="group-header">{{ t('zones.title') }}</h2>
    <div class="group">
      <div class="group-row zones-bar-row">
        <div class="zones-bar" role="img" :aria-label="t('zones.bar')">
          <span
            v-for="zone in zones.filter((z) => z.ds > 0)"
            :key="zone.number"
            :class="`zone-${zone.number}`"
            :style="{ flexGrow: zone.ds }"
          ></span>
        </div>
      </div>
      <div v-for="zone in zones" :key="zone.number" class="group-row">
        <span class="zone-dot" :class="`zone-${zone.number}`" aria-hidden="true">{{ zone.number }}</span>
        <span class="row-label">
          {{ t('zones.zone', { number: zone.number, name: t(`zones.z${zone.number}.name`) }) }}
          <span class="row-detail">
            {{ t('zones.detail', { range: t(`zones.z${zone.number}.range`), description: t(`zones.z${zone.number}.description`) }) }}
          </span>
        </span>
        <span class="zone-time">
          {{ formatTime(zone.ds) }}
          <span class="row-detail">{{ t('zones.share', { percent: Math.round(zone.percent) }) }}</span>
        </span>
      </div>
    </div>
    <p class="review-hint">{{ t(workout.heartRates ? 'zones.basisWatch' : 'zones.basis', { bpm: maxHr }) }}</p>
  </section>
  <p v-else-if="maxHr === null && hasHeartRate" class="banner">{{ t('zones.missingMax') }}</p>
</template>
