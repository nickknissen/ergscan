<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatTime, parseTime } from '../core/time';

const model = defineModel<number | null>({ required: true });
defineProps<{ label: string }>();

const text = ref('');
const invalid = ref(false);

watch(
  model,
  (value) => {
    text.value = value === null ? '' : formatTime(value);
    invalid.value = false;
  },
  { immediate: true },
);

function commit() {
  const trimmed = text.value.trim();
  if (trimmed === '') {
    model.value = null;
    return;
  }
  const parsed = parseTime(trimmed);
  if (parsed === null) {
    invalid.value = true;
    return;
  }
  model.value = parsed;
  text.value = formatTime(parsed);
}
</script>

<template>
  <input
    v-model="text"
    class="cell"
    :class="{ invalid }"
    :aria-label="label"
    :aria-invalid="invalid"
    inputmode="decimal"
    autocomplete="off"
    @change="commit"
  />
</template>
