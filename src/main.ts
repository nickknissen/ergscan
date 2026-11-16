import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { prefetchOcrAssets } from './ocr/assets';
import './style.css';

document.documentElement.lang = i18n.global.locale.value;
createApp(App).use(i18n).mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void (async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    await prefetchOcrAssets();
  })().catch((error: unknown) => console.warn('OCR prefetch failed', error));
}
