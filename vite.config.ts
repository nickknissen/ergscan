import { readFileSync } from 'node:fs';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import en from './src/locales/en/i18n.json' with { type: 'json' };

const versionOf = (pkg: string): string =>
  (JSON.parse(readFileSync(new URL(`./node_modules/${pkg}/package.json`, import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  server: { allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  define: {
    __OCR_VERSION__: JSON.stringify(`${versionOf('tesseract.js')}-${versionOf('tesseract.js-core')}`),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: en.app.title,
        short_name: en.app.title,
        description: en.app.tagline,
        theme_color: '#0b2a4a',
        background_color: '#0b1622',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', '**/roboto-flex-latin*.woff2'],
        globIgnores: ['tesseract/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 8 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
