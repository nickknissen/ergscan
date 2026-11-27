<script setup lang="ts">
import MdIcon from '@nickknissen/m3-vue/components/MdIcon.vue';
import { useI18n } from 'vue-i18n';

defineProps<{ showIntro: boolean; cameraError: string; cameraSupported: boolean }>();
const emit = defineEmits<{ guide: []; photo: []; choose: []; manual: [] }>();
const { t } = useI18n();
</script>

<template>
  <section class="capture">
    <div v-if="showIntro" class="hero">
      <img src="/icon.svg" alt="" class="hero-icon" width="56" height="56" />
      <p class="hero-tagline">{{ t('app.tagline') }}</p>
      <p class="hero-hint">{{ t('capture.hint') }}</p>
      <button type="button" class="tonal" @click="emit('guide')">
        <MdIcon name="menu_book" />
        {{ t('guide.open') }}
      </button>
    </div>

    <p v-if="cameraError" class="banner banner-error" role="alert">{{ cameraError }}</p>

    <div class="group">
      <button v-if="!showIntro" type="button" class="group-row tappable" @click="emit('guide')">
        <MdIcon name="menu_book" class="row-icon" />
        <span class="row-label">{{ t('guide.open') }}</span>
      </button>
      <button v-if="!cameraSupported || cameraError" type="button" class="group-row tappable" @click="emit('photo')">
        <MdIcon name="photo_camera" class="row-icon" />
        <span class="row-label">{{ t('capture.takePhoto') }}</span>
      </button>
      <button type="button" class="group-row tappable" @click="emit('choose')">
        <MdIcon name="photo_library" class="row-icon" />
        <span class="row-label">{{ t('capture.chooseImage') }}</span>
      </button>
      <button type="button" class="group-row tappable" @click="emit('manual')">
        <MdIcon name="edit" class="row-icon" />
        <span class="row-label">{{ t('capture.manual') }}</span>
      </button>
    </div>
  </section>
</template>
