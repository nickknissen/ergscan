import { registerIcons } from 'm3-vue/icons';
import { installRipple } from 'm3-vue/ui/ripple';
import { createApp } from 'vue';
import App from './App.vue';
import { applyTheme, loadAccent, loadTheme } from './core/settings';
import { i18n } from './i18n';
import { prefetchOcrAssets } from './ocr/assets';
import { ICONS } from './ui/icons';
import '@fontsource-variable/roboto-flex';
import 'm3-vue/style.css';
import './style.css';

registerIcons(ICONS);

document.documentElement.lang = i18n.global.locale.value;
try {
  applyTheme(document, loadTheme(localStorage), loadAccent(localStorage));
} catch {
  applyTheme(document, 'system');
}
/** iOS Safari ignores `user-scalable=no` and won't let `touch-action` stop a pinch, but a cancelled gesture doesn't zoom. */
document.addEventListener('gesturestart', (event) => event.preventDefault());

createApp(App).use(i18n).mount('#app');
installRipple(document);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void (async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    await prefetchOcrAssets();
  })().catch((error: unknown) => console.warn('OCR prefetch failed', error));
}
