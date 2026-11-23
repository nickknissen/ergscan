<script setup lang="ts">
import MdIcon from 'm3-vue/components/MdIcon.vue';
import type { Point } from 'm3-vue/ui/menu';
import { usePopoverMenu } from 'm3-vue/ui/popoverMenu';
import { shallowRef, useTemplateRef } from 'vue';
import type { IconName } from '../ui/icons';

defineProps<{ label: string; items: readonly { id: string; label: string; icon: IconName }[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const menu = useTemplateRef<HTMLDivElement>('menu');
const returnFocus = shallowRef<HTMLElement | null>(null);
let point: Point | null = null;

const { close, onToggle, onItemKeydown } = usePopoverMenu(returnFocus, menu, '[role="menuitem"]', () => 0, () => point);

function openAt(at: Point, focusAfter: HTMLElement | null) {
  point = at;
  returnFocus.value = focusAfter;
  close();
  menu.value?.showPopover();
}

function onMenuToggle(event: Event) {
  onToggle(event);
  const lostFocus = document.activeElement === document.body || menu.value?.contains(document.activeElement);
  if ((event as ToggleEvent).newState === 'closed' && lostFocus) returnFocus.value?.focus();
}

function choose(id: string) {
  close();
  returnFocus.value?.focus();
  emit('select', id);
}

defineExpose({ openAt });
</script>

<template>
  <div ref="menu" popover class="menu" role="menu" :aria-label="label" @toggle="onMenuToggle">
    <button
      v-for="(item, index) in items"
      :key="item.id"
      type="button"
      role="menuitem"
      class="menu-item"
      tabindex="-1"
      @click="choose(item.id)"
      @keydown="onItemKeydown($event, index)"
    >
      <MdIcon :name="item.icon" class="menu-icon" />
      {{ item.label }}
    </button>
  </div>
</template>
