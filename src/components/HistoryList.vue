<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { entryDateLabel } from '../core/dates';
import type { HistoryEntry } from '../core/history';
import { formatTime } from '../core/time';
import { contextMenuPoint } from '../ui/menu';
import { keepExisting, nextSelection, type Selection } from '../ui/selection';
import { isTextField } from '../ui/shortcuts';
import MdContextMenu from './MdContextMenu.vue';
import MdIcon from './MdIcon.vue';

const props = defineProps<{ entries: readonly HistoryEntry[]; current: string | null }>();
const emit = defineEmits<{ open: [entry: HistoryEntry]; remove: [entries: HistoryEntry[]] }>();

const { t, locale } = useI18n();

const selection = ref<Selection>({ selected: [], anchor: null });
const ids = computed(() => props.entries.map((e) => e.id));
const selectedEntries = computed(() => props.entries.filter((e) => selection.value.selected.includes(e.id)));

watch(ids, (value) => (selection.value = keepExisting(selection.value, value)));

function clearSelection() {
  selection.value = { selected: [], anchor: null };
}

function select(entry: HistoryEntry, toggle: boolean, range: boolean) {
  selection.value = nextSelection(selection.value, ids.value, entry.id, { toggle, range });
}

function onOpenClick(event: MouseEvent, entry: HistoryEntry) {
  const toggle = event.ctrlKey || event.metaKey;
  if (toggle || event.shiftKey) {
    select(entry, toggle, event.shiftKey);
    return;
  }
  clearSelection();
  emit('open', entry);
}

function onOpenKeydown(event: KeyboardEvent, entry: HistoryEntry) {
  const toggle = event.ctrlKey || event.metaKey;
  if (event.key !== ' ' || !(toggle || event.shiftKey)) return;
  event.preventDefault();
  select(entry, toggle, event.shiftKey);
}

function onListKeydown(event: KeyboardEvent) {
  if (isTextField(event.target as HTMLElement)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    selection.value = { selected: [...ids.value], anchor: ids.value[0] ?? null };
  } else if (event.key === 'Escape' && selection.value.selected.length) {
    event.preventDefault();
    clearSelection();
  }
}

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
  else emit('remove', selection.value.selected.includes(entry.id) ? selectedEntries.value : [entry]);
}

function entryDate(entry: HistoryEntry): string {
  return entryDateLabel(entry.workout.startTime, locale.value);
}

function entryDetail(entry: HistoryEntry): string {
  const { dragFactor } = entry.workout;
  return dragFactor === null ? entryDate(entry) : t('history.detailWithDrag', { date: entryDate(entry), value: dragFactor });
}

function entrySummary(entry: HistoryEntry): string {
  const { distanceM, durationDs } = entry.workout.summary;
  const summary = t('history.summary', { distance: distanceM, time: formatTime(durationDs ?? 0) });
  return entry.workout.name ? t('history.named', { name: entry.workout.name, summary }) : summary;
}
</script>

<template>
  <div class="history-list" @keydown="onListKeydown">
    <div v-if="selectedEntries.length" class="selection-bar">
      <span class="selection-count" role="status">{{ t('history.selected', { count: selectedEntries.length }) }}</span>
      <button type="button" @click="clearSelection">{{ t('history.clearSelection') }}</button>
      <button type="button" class="tonal" @click="emit('remove', selectedEntries)">{{ t('history.deleteSelected') }}</button>
    </div>
    <div class="group">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="group-row"
        :class="{ 'history-selected': selection.selected.includes(entry.id) }"
        @contextmenu.prevent="openMenu($event, entry)"
      >
        <button
          type="button"
          class="history-open"
          :aria-current="entry.id === current ? 'true' : undefined"
          :aria-pressed="selectedEntries.length ? selection.selected.includes(entry.id) : undefined"
          @click="onOpenClick($event, entry)"
          @keydown="onOpenKeydown($event, entry)"
        >
          <MdIcon :name="selection.selected.includes(entry.id) ? 'check' : 'rowing'" class="row-icon" />
          <span class="row-label">
            {{ entrySummary(entry) }}
            <span class="row-detail">{{ entryDetail(entry) }}</span>
          </span>
        </button>
        <button
          type="button"
          class="icon"
          :aria-label="t('history.remove', { date: entryDate(entry) })"
          :title="t('history.remove', { date: entryDate(entry) })"
          @click="emit('remove', [entry])"
        >
          <MdIcon name="delete" />
        </button>
      </div>
    </div>
    <MdContextMenu ref="menu" :label="t('history.actions')" :items="menuItems" @select="onMenu" />
  </div>
</template>
