<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconName } from '../ui/icons';

const props = defineProps<{ name: IconName; filled?: boolean }>();

const markup = computed(() => ICONS[props.name][props.filled ? 1 : 0]);
</script>

<template>
  <svg class="symbol" viewBox="0 -960 960 960" aria-hidden="true" v-html="markup"></svg>
</template>
