<script setup lang="ts">
import { nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HistoryEntry } from '../core/history';
import { clampListWidth, LIST_WIDTH, listPaneKey, type ListPane } from '../core/settings';
import HistoryList from './HistoryList.vue';
import MdIcon from './MdIcon.vue';

/**
 * The history list beside the open screen on wide windows, with a divider to resize or collapse it.
 * Renders two grid items (the list and the divider) straight into the parent's `.screen` grid.
 */
defineProps<{ entries: readonly HistoryEntry[]; current: string | null }>();
const emit = defineEmits<{ open: [entry: HistoryEntry]; remove: [entries: HistoryEntry[]] }>();
const listPane = defineModel<ListPane>('listPane', { required: true });
const { t } = useI18n();

let resizeStart: { x: number; width: number } | null = null;

function onDividerKeydown(event: KeyboardEvent) {
  const next = listPaneKey(listPane.value, event.key);
  if (!next) return;
  event.preventDefault();
  listPane.value = next;
  if (next.collapsed) void nextTick(() => document.querySelector<HTMLElement>('.pane-toggle')?.focus());
}

function onDividerPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizeStart = { x: event.clientX, width: listPane.value.collapsed ? LIST_WIDTH.min : listPane.value.width };
}

function onDividerPointerMove(event: PointerEvent) {
  if (!resizeStart) return;
  listPane.value = { width: clampListWidth(resizeStart.width + event.clientX - resizeStart.x), collapsed: false };
}

function onDividerPointerUp() {
  resizeStart = null;
}

function toggleListPane() {
  listPane.value = { ...listPane.value, collapsed: !listPane.value.collapsed };
}
</script>

<template>
  <aside v-show="!listPane.collapsed" id="history-pane" class="history-pane" :aria-label="t('history.title')">
    <HistoryList :entries="entries" :current="current" @open="emit('open', $event)" @remove="emit('remove', $event)" />
  </aside>
  <div class="pane-divider">
    <button
      type="button"
      class="icon pane-toggle"
      :aria-label="listPane.collapsed ? t('history.expand') : t('history.collapse')"
      :title="listPane.collapsed ? t('history.expand') : t('history.collapse')"
      aria-controls="history-pane"
      :aria-expanded="!listPane.collapsed"
      @click="toggleListPane"
    >
      <MdIcon :name="listPane.collapsed ? 'left_panel_open' : 'left_panel_close'" />
    </button>
    <div
      v-if="!listPane.collapsed"
      class="pane-handle"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-controls="history-pane"
      :aria-label="t('history.resize')"
      :title="t('history.resize')"
      :aria-valuemin="LIST_WIDTH.min"
      :aria-valuemax="LIST_WIDTH.max"
      :aria-valuenow="listPane.width"
      @keydown="onDividerKeydown"
      @pointerdown="onDividerPointerDown"
      @pointermove="onDividerPointerMove"
      @pointerup="onDividerPointerUp"
      @pointercancel="onDividerPointerUp"
      @dblclick="listPane = { width: LIST_WIDTH.initial, collapsed: false }"
    ></div>
  </div>
</template>
