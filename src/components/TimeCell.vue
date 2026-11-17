<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatTime, parseTime } from '../core/time';
import { cellEscape } from '../ui/shortcuts';
import { CELL_HINT_ID, trackCellValidity } from './cellValidity';

const model = defineModel<number | null>({ required: true });
defineProps<{ label: string }>();

const { t } = useI18n();
const text = ref('');
const invalid = ref(false);
trackCellValidity(invalid);

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
    invalid.value = false;
    model.value = null;
    return;
  }
  const parsed = parseTime(trimmed);
  if (parsed === null) {
    invalid.value = true;
    return;
  }
  invalid.value = false;
  model.value = parsed;
  text.value = formatTime(parsed);
}

function onEscape(event: KeyboardEvent) {
  event.preventDefault();
  const committed = model.value === null ? '' : formatTime(model.value);
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
    :placeholder="t('review.timePlaceholder')"
    inputmode="decimal"
    autocomplete="off"
    @change="commit"
    @keydown.esc="onEscape"
  />
</template>
