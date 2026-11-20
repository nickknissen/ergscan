# Development

[← Back to README](../README.md)

Requires Node.js 20.19+ or 22.12+. The sync server needs Node.js 24.

```sh
npm install
npm run dev        # start the dev server
npm run check      # typecheck and run the tests
npm run build      # production build in dist/
npm run preview    # serve the production build
npm run eval       # score OCR and parsing against the labelled test images
```

`npm run dev` and `npm run build` copy the Tesseract worker, wasm core and
English model from `node_modules` into `public/tesseract/`, so the app never
loads OCR files from a CDN.

## Private sync

Sync is always enabled in `npm run dev`. Run the server alongside it:

```sh
npm run sync:serve   # API on 127.0.0.1:8787
npm run dev          # Vite proxies /api/sync/* to the API
```

Set `ERGSCAN_SYNC_ORIGIN` to proxy to a server on another address, for
example when port 8787 is taken. The server's own settings are listed in
[Self-hosting](self-hosting.md#sync-server-settings).

## OCR evaluation

`testdata/` holds photos and screenshots of PM4/PM5 results screens, each with
a JSON file describing what the screen shows and the workout it should parse
to. `npm run eval` runs the same preprocessing and OCR as the app on every
image in Node and prints per-image scores for OCR cells, rows, workout fields
and lap counts. Workouts photographed across several scrolled screens are
described in `testdata/multi/`; their photos are merged in order and scored
against the whole workout. Results are saved to `eval-results/` (ignored by git).

Useful flags, passed after `--`:

| Flag | Effect |
| --- | --- |
| `--only <text>` | Only images whose name contains the text |
| `--sens <n>`, `--blur <n>`, `--long <n>`, `--crop <n>` | Override a preprocessing option |
| `--framed` | Skip screen detection and the heading-row retry, and use the labelled screen position |
| `--show` | Print the OCR text |
| `--dump` | Write the preprocessed images to `eval-results/images/` |
| `--label <name>` | Add a label to the saved result file name |

## Project layout

| Path | Purpose |
| --- | --- |
| `src/core/` | Framework-free logic: time parsing, PM4/PM5 parser, workout model, FIT export, heart rate zones, history, settings, routing |
| `src/ocr/` | Screen detection, image preprocessing, Tesseract worker and OCR asset caching |
| `src/sync/` | Sync client: end-to-end encryption, history store, merging edits from linked devices |
| `src/App.vue` | App shell: navigation bar, tabs, history pane, routing between screens and the review session |
| `src/views/` | One component per screen: capture, scanning, review, history and settings |
| `src/composables/` | App state shared across screens: settings, and saved history with sync |
| `src/components/` | Vue components: camera, review table, PM guide, sync settings, Material 3 dialogs and menus |
| `src/ui/` | Framework-free UI behavior: icons, menus, ripples, transitions, confirm dialogs |
| `src/locales/<lang>/i18n.json` | Translations; every locale must have the same keys |
| `server/` | Sync API server, its Dockerfile and the nginx rule for sync deployments |
| `testdata/` | Labelled results-screen images for tests and `npm run eval` |
| `scripts/` | Build helpers, the OCR evaluation script and the README animation |
| `docs/` | This documentation |

## Adding a language

Create `src/locales/<code>/i18n.json` with the same keys as
`src/locales/en/i18n.json` and register it in `src/i18n.ts`. A test fails if a
locale is missing keys.

## README animation

With `npm run build && npx vite preview --port 4317` running,
`node scripts/readme-demo/capture.mjs` screenshots the app and
`node scripts/readme-demo/render.mjs` renders `.github/readme-demo.gif`. It
needs Chrome; a Playwright Chromium is found on its own.
