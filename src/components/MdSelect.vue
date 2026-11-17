<script setup lang="ts" generic="T extends string | number">
import { computed, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue';
import { nextOptionIndex, placeMenu } from '../ui/menu';
import MdIcon from './MdIcon.vue';

const model = defineModel<T>({ required: true });
const props = defineProps<{ options: readonly { value: T; label: string }[]; labelledby: string }>();

const id = useId();
const menuId = `${id}-menu`;
const valueId = `${id}-value`;
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const menu = useTemplateRef<HTMLDivElement>('menu');
const open = ref(false);

const selectedIndex = computed(() => props.options.findIndex((o) => o.value === model.value));
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '');

function optionElements(): HTMLElement[] {
  return [...(menu.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
}

function focusOption(index: number) {
  optionElements()[index]?.focus();
}

function place() {
  const m = menu.value;
  const t = trigger.value;
  if (!m || !t) return;
  const anchor = t.getBoundingClientRect();
  m.style.minWidth = `${anchor.width}px`;
  const { left, top, above } = placeMenu(anchor, { width: m.offsetWidth, height: m.offsetHeight }, { width: innerWidth, height: innerHeight });
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  m.style.transformOrigin = above ? 'bottom' : 'top';
}

function close() {
  if (menu.value?.matches(':popover-open')) menu.value.hidePopover();
}

function onToggle(event: Event) {
  open.value = (event as ToggleEvent).newState === 'open';
  if (open.value) {
    place();
    focusOption(Math.max(0, selectedIndex.value));
    addEventListener('resize', close);
    addEventListener('scroll', close, true);
  } else {
    removeEventListener('resize', close);
    removeEventListener('scroll', close, true);
  }
}

onBeforeUnmount(() => {
  removeEventListener('resize', close);
  removeEventListener('scroll', close, true);
});

function choose(value: T) {
  model.value = value;
  close();
  trigger.value?.focus();
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  menu.value?.showPopover();
}

function onOptionKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'Tab') {
    close();
    return;
  }
  const next = nextOptionIndex(index, event.key, props.options.length);
  if (next === null) return;
  event.preventDefault();
  focusOption(next);
}
</script>

<template>
  <button
    :id="id"
    ref="trigger"
    type="button"
    class="select-trigger"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="menuId"
    :aria-labelledby="`${labelledby} ${valueId}`"
    :popovertarget="menuId"
    @keydown="onTriggerKeydown"
  >
    <span :id="valueId">{{ selectedLabel }}</span>
    <MdIcon name="arrow_drop_down" class="select-arrow" />
  </button>
  <div :id="menuId" ref="menu" popover class="menu" role="listbox" :aria-labelledby="labelledby" @toggle="onToggle">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="option"
      class="menu-item"
      :aria-selected="index === selectedIndex"
      tabindex="-1"
      @click="choose(option.value)"
      @keydown="onOptionKeydown($event, index)"
    >
      <MdIcon name="check" class="menu-check" />
      {{ option.label }}
    </button>
  </div>
</template>
