<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { entryDateLabel } from '../core/dates';
import type { HistoryEntry } from '../core/history';
import { formatTime } from '../core/time';
import { contextMenuPoint } from '../ui/menu';
import MdContextMenu from './MdContextMenu.vue';
import MdIcon from './MdIcon.vue';

defineProps<{ entries: readonly HistoryEntry[]; selected: string | null }>();
const emit = defineEmits<{ open: [entry: HistoryEntry]; remove: [entry: HistoryEntry] }>();

const { t, locale } = useI18n();

const menu = useTemplateRef<InstanceType<typeof MdContextMenu>>('menu');
const menuItems = computed(() => [
  { id: 'open', label: t('history.open'), icon: 'edit' as const },
  { id: 'delete', label: t('history.delete'), icon: 'delete' as const },
]);
let menuEntry: HistoryEntry | null = null;

function openMenu(event: MouseEvent, entry: HistoryEntry) {
  const row = event.currentTarget as HTMLElement;
  menuEntry = entry;
  const point = contextMenuPoint({ x: event.clientX, y: event.clientY }, row.getBoundingClientRect());
  menu.value?.openAt(point, row.querySelector<HTMLElement>('.history-open'));
}

function onMenu(id: string) {
  const entry = menuEntry;
  menuEntry = null;
  if (!entry) return;
  if (id === 'open') emit('open', entry);
  else emit('remove', entry);
}

function entryDate(entry: HistoryEntry): string {
  return entryDateLabel(entry.workout.startTime, locale.value);
}

function entrySummary(entry: HistoryEntry): string {
  const { distanceM, durationDs } = entry.workout.summary;
  return t('history.summary', { distance: distanceM, time: formatTime(durationDs ?? 0) });
}
</script>

<template>
  <div class="history-list">
    <div class="group">
      <div v-for="entry in entries" :key="entry.id" class="group-row" @contextmenu.prevent="openMenu($event, entry)">
        <button
          type="button"
          class="history-open"
          :aria-current="entry.id === selected ? 'true' : undefined"
          @click="emit('open', entry)"
        >
          <MdIcon name="rowing" class="row-icon" />
          <span class="row-label">
            {{ entrySummary(entry) }}
            <span class="row-detail">{{ entryDate(entry) }}</span>
          </span>
        </button>
        <button
          type="button"
          class="icon"
          :aria-label="t('history.remove', { date: entryDate(entry) })"
          :title="t('history.remove', { date: entryDate(entry) })"
          @click="emit('remove', entry)"
        >
          <MdIcon name="delete" />
        </button>
      </div>
    </div>
    <MdContextMenu ref="menu" :label="t('history.actions')" :items="menuItems" @select="onMenu" />
  </div>
</template>
