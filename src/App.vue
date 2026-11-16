<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <header>
    <h1>{{ t('app.title') }}</h1>
    <p>{{ t('app.tagline') }}</p>
  </header>
  <main></main>
</template>
