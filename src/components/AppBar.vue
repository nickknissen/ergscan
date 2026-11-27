<script setup lang="ts">
import MdIcon from '@nickknissen/m3-vue/components/MdIcon.vue';
import MdMenu from '@nickknissen/m3-vue/components/MdMenu.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IconName } from '../ui/icons';

/**
 * The top app bar: a back arrow on the review screen and the guide, the screen title, and on the
 * review screen the save button and overflow menu (`showActions`). `originTitle` names the screen
 * the back arrow returns to from review.
 */
const props = defineProps<{
  stage: string;
  scrolled: boolean;
  originTitle: string;
  showActions: boolean;
  canSave: boolean;
  saved: boolean;
  overflowItems: readonly { id: string; label: string; icon: IconName }[];
}>();
const emit = defineEmits<{ back: []; save: []; menu: [id: string] }>();
const { t } = useI18n();

const title = computed(() => {
  if (props.stage === 'review') return t('review.title');
  if (props.stage === 'guide') return t('guide.title');
  if (props.stage === 'history') return t('history.title');
  if (props.stage === 'settings') return t('settings.title');
  return t('app.title');
});

const backLabel = computed(() => {
  if (props.stage === 'review') return t('review.back', { screen: props.originTitle });
  if (props.stage === 'guide') return t('review.back', { screen: t('tabs.scan') });
  return null;
});
</script>

<template>
  <header class="navbar" :class="{ 'navbar-scrolled': scrolled }">
    <div class="navbar-side">
      <button v-if="backLabel" type="button" class="nav-button" :aria-label="backLabel" :title="backLabel" @click="emit('back')">
        <MdIcon name="arrow_back" />
      </button>
    </div>
    <h1 class="navbar-title">{{ title }}</h1>
    <div class="navbar-side">
      <button v-if="showActions" type="button" class="primary nav-action" :disabled="!canSave" @click="emit('save')">
        {{ saved ? t('review.saved') : t('review.save') }}
      </button>
      <MdMenu v-if="showActions" :label="t('review.more')" :items="overflowItems" @select="emit('menu', $event)" />
    </div>
  </header>
</template>
