# PROTOTYPE: PP-OCRv6 tiny in the browser

Throwaway, on branch `prototype/pp-ocrv6`. It answers recommendation R2 (with R3) of
`docs/research/ocr-accuracy.md`: does PP-OCRv6 tiny, run on onnxruntime-web in the real app, keep the
accuracy measured offline, and is it fast enough and memory-safe on a phone, under the CSP and offline?

## Run it

```sh
npm run ocr-assets                        # downloads the pinned models once, checks their sha256
npm run eval -- --engine ppocr            # all photos, about 8 minutes on the dev box
npm run eval -- --engine ppocr --only pm5 --show
npm run dev                               # then open /?ocr=ppocr
```

Eval switches: `--framed` (labelled screen at 800 px wide), `--ppocr-long`, `--ppocr-width`, `--det-side`,
`--det-official` (the model's own inference.yml post-processing), `--rec-width` (pad boxes to at least this
width; 320 reproduces RapidOCR, the default 0 pads each batch only to its widest box), `--rec-batch`, `--gray`.

In the app, `?ocr=ppocr` in the address swaps the engine for every scan. The whole photo goes in at 1000 px
on its long side, in colour, without Tesseract's crop, blur or threshold. A photo from the in-app camera
frame goes in at 800 px wide. The last lines of **Recognized text** on the review screen give the load time,
detection and recognition times, the number of boxes and the size of the WebAssembly memory.

## Measuring on a phone

1. Open the app with `?ocr=ppocr`, online, and reload once so the service worker is in control.
2. Scan a photo. Note the three report lines: the first read includes loading the runtime and models.
3. Scan four more photos without closing the tab. Note each total and the WebAssembly memory: it should
   level off, not climb with every read.
4. Peak memory of the whole tab: Android, `chrome://inspect` from a desktop Chrome; iPhone, Safari's Web
   Inspector, Timelines, Memory. A tab that reloads by itself mid-scan on iOS is WebKit bug 304810.
5. Airplane mode, reload, scan again: it must still read.
6. The same photo without `?ocr=ppocr`, for Tesseract's time on the same phone.

## WebKit without an iPhone

`.github/workflows/ppocr-webkit.yml` runs on every push to this branch, on an Apple silicon macOS runner:
Playwright's WebKit reads the built app, served by `webkit/serve.mjs` with the headers from `nginx-headers.conf`.
`webkit/session.mjs` pastes photos one after another in one page session, discards each review, samples the
page process's memory, and reads once more offline. The artifact `webkit-ppocr` holds a `report.json` per run:
five photos with PP-OCRv6, the same five with Tesseract, and every test photo with PP-OCRv6 for accuracy.
The same script runs locally in the `mcr.microsoft.com/playwright` image, but WebKit there needs a CPU with
AVX for WebAssembly SIMD, which onnxruntime-web requires.

## Files

| File | What |
| --- | --- |
| `pipeline.ts` | Detector input, DB post-processing, recogniser crops, CTC decoding, row grouping. Pure; the ONNX sessions are passed in |
| `geometry.ts` | Connected components, convex hull, minimum-area rectangle, unclip, homography: no OpenCV |
| `ppocr.worker.ts` | Same-origin module worker: onnxruntime-web/wasm, one thread, no proxy |
| `scan.ts` | Browser entry used by `useScan` under the flag; adds the report lines |
| `models.json` | Pinned Hugging Face URLs and sha256 of the two models and the dictionary |

Elsewhere: `scripts/copy-ocr-assets.mjs` (download and self-host), `scripts/eval.ts` (`--engine ppocr`),
`vite.config.ts` (worker format, cache rule), `nginx.conf` (`/ppocr/`), `src/composables/useScan.ts` (flag).
