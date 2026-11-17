<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MONITORS as monitors, type Monitor } from '../core/route';
import MdIcon from './MdIcon.vue';

const props = defineProps<{ monitor: Monitor | null }>();
const emit = defineEmits<{ done: []; pick: [monitor: Monitor]; change: [] }>();

const { t, te } = useI18n();

const steps = ['setup', 'finish', 'results', 'photo'] as const;

const key = (name: string) => `guide.monitors.${props.monitor}.${name}`;
const menuButton = computed(() => (props.monitor ? t(key('menu')) : ''));
</script>

<template>
  <section class="guide-view">
    <template v-if="!monitor">
      <div class="guide-intro">
        <h2 class="guide-question">{{ t('guide.pick.question') }}</h2>
        <p>{{ t('guide.pick.hint') }}</p>
      </div>
      <div class="monitor-choices">
        <button v-for="m in monitors" :key="m" type="button" class="monitor-choice" @click="emit('pick', m)">
          <span class="monitor-choice-name">{{ t(`guide.monitors.${m}.name`) }}</span>
          <span class="monitor-choice-look">{{ t(`guide.monitors.${m}.look`) }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="guide-intro">
        <div class="guide-monitor">
          <span class="guide-badge">{{ t(key('name')) }}</span>
          <button type="button" class="tonal guide-change" @click="emit('change')">{{ t('guide.pick.change') }}</button>
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
