<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();

const steps = ['setup', 'finish', 'results', 'photo'] as const;
</script>

<template>
  <section class="guide-view">
    <div class="guide-intro">
      <span class="guide-badge">{{ t('guide.monitor') }}</span>
      <p>{{ t('guide.intro') }}</p>
    </div>

    <ol class="steps">
      <li v-for="(step, index) in steps" :key="step" class="step">
        <span class="step-number" aria-hidden="true">{{ index + 1 }}</span>
        <div class="step-body">
          <h2>{{ t(`guide.${step}.title`) }}</h2>
          <p>{{ t(`guide.${step}.body`) }}</p>
          <p v-if="step === 'setup'" class="step-path">{{ t('guide.setup.path') }}</p>
          <p v-if="step === 'finish'" class="step-warning">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
            {{ t('guide.finish.warning') }}
          </p>
          <p v-if="step === 'results'" class="step-path">{{ t('guide.results.path') }}</p>
          <p v-if="step === 'results'" class="step-note">{{ t('guide.results.note') }}</p>
        </div>
      </li>
    </ol>

    <button type="button" class="primary large" @click="emit('done')">{{ t('guide.done') }}</button>
  </section>
</template>
