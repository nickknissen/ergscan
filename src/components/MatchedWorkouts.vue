<script setup lang="ts">
import MdIcon from '@nickknissen/m3-vue/components/MdIcon.vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { entryDayLabel } from '../core/dates';
import type { HistoryEntry } from '../core/history';
import { matchedWorkouts, type MatchedRow } from '../core/matchedWorkouts';
import { formatTime } from '../core/time';
import type { Workout } from '../core/workout';

/** `openId`: the open workout's history id, null while it isn't saved. */
const props = defineProps<{ workout: Workout; openId: string | null; entries: readonly HistoryEntry[] }>();
const emit = defineEmits<{ open: [entry: HistoryEntry] }>();

const { t, locale } = useI18n();

const matched = computed(() => matchedWorkouts(props.workout, props.openId, props.entries));
const showAll = ref(false);
watch([() => props.openId, () => matched.value?.structure.key], () => (showAll.value = false));
const rows = computed(() => (showAll.value ? matched.value?.rows : matched.value?.shown) ?? []);
const hiddenCount = computed(() => (matched.value ? matched.value.rows.length - matched.value.shown.length : 0));

function date(row: MatchedRow): string {
  return entryDayLabel(row.startTime, locale.value);
}

/** Result, pace and rate, each kept whole when the row wraps, with the separator ending the line. */
function details(row: MatchedRow): string[] {
  const parts = detailParts(row);
  return parts.map((part, index) => (index < parts.length - 1 ? `${part} ·` : part));
}

function detailParts(row: MatchedRow): string[] {
  const { result, paceDs, rate } = row;
  const parts: string[] = [];
  if (result?.kind === 'time') parts.push(formatTime(result.ds));
  if (result?.kind === 'distance') parts.push(t('matched.meters', { meters: result.m }));
  parts.push(paceDs === null ? '—' : formatTime(paceDs) + t('columns.split', { distance: props.workout.splitDistance }));
  parts.push(rate === null ? '—' : `${rate} ${t('columns.rate')}`);
  return parts;
}

function difference(row: MatchedRow): string {
  const { differenceDs } = row;
  if (row.isOpen) return t('matched.thisWorkout');
  if (differenceDs === null) return '—';
  if (differenceDs === 0) return t('matched.samePace');
  const seconds = (Math.abs(differenceDs) / 10).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return t(differenceDs < 0 ? 'matched.faster' : 'matched.slower', { seconds });
}

function open(row: MatchedRow) {
  const entry = props.entries.find((e) => e.id === row.id);
  if (entry) emit('open', entry);
}
</script>

<template>
  <section v-if="matched" class="matched">
    <h2 class="group-header">{{ t('matched.title') }}</h2>
    <div class="group">
      <component
        :is="row.isOpen ? 'div' : 'button'"
        v-for="row in rows"
        :key="row.id ?? 'open'"
        :type="row.isOpen ? undefined : 'button'"
        class="group-row"
        :class="{ tappable: !row.isOpen, 'matched-open': row.isOpen }"
        :aria-current="row.isOpen ? 'true' : undefined"
        @click="row.isOpen ? undefined : open(row)"
      >
        <MdIcon :name="row.isBest ? 'trophy' : 'rowing'" class="row-icon" />
        <span class="row-label">
          {{ row.isBest ? t('matched.best', { date: date(row) }) : date(row) }}
          <span class="row-detail">
            <template v-for="(part, index) in details(row)" :key="index">{{ index ? ' ' : '' }}<span class="matched-part">{{ part }}</span></template>
          </span>
        </span>
        <span class="matched-difference">{{ difference(row) }}</span>
      </component>
      <button v-if="!showAll && hiddenCount > 0" type="button" class="group-row tappable accent matched-show-all" @click="showAll = true">
        <MdIcon name="keyboard_arrow_down" class="row-icon" />
        <span class="row-label">{{ t('matched.showAll', { count: matched.rows.length }) }}</span>
      </button>
    </div>
  </section>
</template>
