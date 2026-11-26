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
English model from `node_modules` into `public/tesseract/`, and put PP-OCRv6
tiny's models in `public/ppocr/`, so the app never loads OCR files from a CDN.
The models are downloaded from Hugging Face at the revisions pinned in
`src/ocr/ppocr/models.json`, checked against their sha256 and kept in
`node_modules/.cache/ppocr/`, so the first build needs network access.

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

`testdata/` holds photos and screenshots of PM3/PM4/PM5 results screens, each with
a JSON file describing what the screen shows and the workout it should parse
to. `npm run eval` reads every image in Node as the app does, with PP-OCRv6
tiny on onnxruntime-web's WebAssembly, and prints per-image scores for OCR
cells, rows, workout fields and lap counts, and how many workouts came out with
every field right. Workouts photographed across several scrolled screens are
described in `testdata/multi/`; their photos are merged in order and scored
against the whole workout. Results, with each image's OCR text, are saved to
`eval-results/` (ignored by git). Why the app reads with PP-OCRv6, and how it
was measured: [Improving OCR accuracy in the browser](research/ocr-accuracy.md).

Useful flags, passed after `--`:

| Flag | Effect |
| --- | --- |
| `--engine tesseract` | Read with Tesseract and its preprocessing, as browsers without WebAssembly SIMD do |
| `--only <text>` | Only images whose name contains the text |
| `--framed` | Read the labelled screen position, as if the photo was taken in the app's camera frame (with Tesseract: no screen detection or heading-row retry) |
| `--rec-width <px>` | PP-OCRv6: pad boxes to at least this width for the recogniser |
| `--sens <n>`, `--blur <n>`, `--long <n>`, `--crop <n>` | Tesseract: override a preprocessing option |
| `--show` | Print the OCR text |
| `--dump` | Tesseract: write the preprocessed images to `eval-results/images/` |
| `--label <name>` | Add a label to the saved result file name |

## Project layout

| Path | Purpose |
| --- | --- |
| `src/core/` | Framework-free logic: time parsing, PM3/PM4/PM5 parser, workout model, FIT export, heart rate zones, history, settings, routing |
| `src/ocr/` | Choosing the OCR engine and caching its files; Tesseract's screen detection, preprocessing and worker |
| `src/ocr/ppocr/` | PP-OCRv6 tiny: detector and recogniser pre- and post-processing, row grouping, and its worker |
| `src/sync/` | Sync client: end-to-end encryption, history store, merging edits from linked devices |
| `src/App.vue` | App shell: navigation bar, tabs, history pane, routing between screens and the review session |
| `src/views/` | One component per screen: capture, scanning, review, history and settings |
| `src/composables/` | App state shared across screens: settings, and saved history with sync |
| `src/components/` | Vue components: camera, review table, PM guide, sync settings, the history list's context menu |
| `src/ui/` | Framework-free UI behavior: the app's icons, selection, shortcuts, transitions, layout |
| `src/style.css` | ErgScan's own styles, on top of m3-vue's |
| [`m3-vue`](https://github.com/nickknissen/m3-vue) | Shared with garmin-dashboard: the Material 3 styles, `MdIcon`, `MdDialog`, `MdMenu`, `MdSelect`, `MdListDetail` (the resizable history list beside the open screen), ripples, menus, confirm dialogs and keyboard navigation. A new icon goes in `src/ui/icons.ts`. A tagged release reaches ErgScan as a Renovate PR (`renovate.json`, m3-vue only) |
| `src/locales/<lang>/i18n.json` | Translations; every locale must have the same keys |
| `server/` | Sync API server, its storage check (`npm run sync:check`), its Dockerfile, the nginx rule and rate limits for sync deployments, and the test of the web image's nginx config (`nginx.conf`, `nginx-headers.conf` at the root) |
| `mcp/` | Local MCP server: links as a device, decrypts the history and answers agents' tool calls (see [MCP](mcp.md)) |
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
