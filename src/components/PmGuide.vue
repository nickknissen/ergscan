<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MdIcon from './MdIcon.vue';

const emit = defineEmits<{ done: [] }>();

const { t, te } = useI18n();

const monitors = ['pm5', 'pm4'] as const;
type Monitor = (typeof monitors)[number];

const steps = ['setup', 'finish', 'results', 'photo'] as const;
const monitor = ref<Monitor | null>(null);

const key = (name: string) => `guide.monitors.${monitor.value}.${name}`;
const menuButton = computed(() => (monitor.value ? t(key('menu')) : ''));
</script>

<template>
  <section class="guide-view">
    <template v-if="!monitor">
      <div class="guide-intro">
        <h2 class="guide-question">{{ t('guide.pick.question') }}</h2>
        <p>{{ t('guide.pick.hint') }}</p>
      </div>
      <div class="monitor-choices">
        <button v-for="m in monitors" :key="m" type="button" class="monitor-choice" @click="monitor = m">
          <span class="monitor-choice-name">{{ t(`guide.monitors.${m}.name`) }}</span>
          <span class="monitor-choice-look">{{ t(`guide.monitors.${m}.look`) }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="guide-intro">
        <div class="guide-monitor">
          <span class="guide-badge">{{ t(key('name')) }}</span>
          <button type="button" class="tonal guide-change" @click="monitor = null">{{ t('guide.pick.change') }}</button>
        </div>
        <p>{{ t('guide.intro') }}</p>
      </div>

      <ol class="steps">
        <li v-for="(step, index) in steps" :key="step" class="step">
          <span class="step-number" aria-hidden="true">{{ index + 1 }}</span>
          <div class="step-body">
            <h2>{{ t(`guide.${step}.title`) }}</h2>
            <p>{{ t(`guide.${step}.body`, { menu: menuButton }) }}</p>
            <p v-if="step === 'setup'" class="step-path">{{ t('guide.setup.path') }}</p>
            <p v-if="step === 'finish'" class="step-warning">
              <MdIcon name="warning" />
              {{ t('guide.finish.warning', { menu: menuButton }) }}
            </p>
            <template v-if="step === 'results'">
              <p class="step-path">{{ t(key('memoryPath')) }}</p>
              <p v-if="te(key('memoryNote'))" class="step-note">{{ t(key('memoryNote')) }}</p>
              <p class="step-note">{{ t('guide.results.note') }}</p>
            </template>
          </div>
        </li>
      </ol>

      <button type="button" class="primary large" @click="emit('done')">{{ t('guide.done') }}</button>
    </template>
  </section>
</template>
