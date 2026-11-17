<script setup lang="ts">
import { ref, watch } from 'vue';
import { cellEscape } from '../ui/shortcuts';
import { CELL_HINT_ID, trackCellValidity } from './cellValidity';

const model = defineModel<number | null>({ required: true });
defineProps<{ label: string }>();

const text = ref('');
const invalid = ref(false);
trackCellValidity(invalid);

watch(
  model,
  (value) => {
    text.value = value === null ? '' : String(value);
    invalid.value = false;
  },
  { immediate: true },
);

function commit() {
  const trimmed = text.value.trim();
  if (trimmed === '') {
    invalid.value = false;
    model.value = null;
    return;
  }
  if (!/^\d+$/.test(trimmed)) {
    invalid.value = true;
    return;
  }
  invalid.value = false;
  model.value = Number(trimmed);
}

function onEscape(event: KeyboardEvent) {
  event.preventDefault();
  const committed = model.value === null ? '' : String(model.value);
  if (cellEscape(text.value, committed) === 'blur') {
    (event.target as HTMLInputElement).blur();
    return;
  }
  text.value = committed;
  invalid.value = false;
}
</script>

<template>
  <input
    v-model="text"
    class="cell"
    :class="{ invalid }"
    :aria-label="label"
    :aria-invalid="invalid"
    :aria-describedby="invalid ? CELL_HINT_ID : undefined"
    inputmode="numeric"
    autocomplete="off"
    @change="commit"
    @keydown.esc="onEscape"
  />
</template>
