<script setup lang="ts">
import { ref, watch } from 'vue';

const model = defineModel<number | null>({ required: true });
defineProps<{ label: string }>();

const text = ref('');
const invalid = ref(false);

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
    model.value = null;
    return;
  }
  if (!/^\d+$/.test(trimmed)) {
    invalid.value = true;
    return;
  }
  model.value = Number(trimmed);
}
</script>

<template>
  <input
    v-model="text"
    class="cell"
    :class="{ invalid }"
    :aria-label="label"
    :aria-invalid="invalid"
    inputmode="numeric"
    autocomplete="off"
    @change="commit"
  />
</template>
