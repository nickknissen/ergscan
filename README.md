# ErgScan

An open-source progressive web app that reads the results screen of a Concept2
PM4 or PM5 monitor from a photo and exports the workout as a FIT file you can upload to
Strava, Garmin Connect, intervals.icu or any other tool that accepts FIT.

Everything runs on your device. The photo is never uploaded: text recognition
happens in the browser, and the app keeps working offline once it has been
opened.

## Features

- Take a photo of the PM4/PM5 results screen, or pick an image you already have.
- Offline OCR with [Tesseract.js](https://github.com/naptha/tesseract.js),
  with image thresholding to cope with glare and uneven light on the LCD.
- Parses the PM4/PM5 table: time, meters, split (/500m or /1000m), stroke rate,
  and heart rate, watts or calories. Rest intervals are detected.
- Editable review table to fix anything the OCR got wrong, add or remove rows,
  set the start time and recalculate the total.
- FIT export as an indoor rowing activity: one lap per split or interval, rest
  laps marked as rest, and per-lap distance, stroke rate, power and heart rate.
  Power is derived from pace when the screen has no watts column.
- Manual entry when no photo is at hand.
- Installable PWA in English and Danish.

## Taking a good photo

- Hold the phone straight in front of the screen, not at an angle.
- Let the table fill most of the frame.
- Avoid reflections on the digits.

## Development

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev        # start the dev server
npm run check      # typecheck and run the tests
npm run build      # production build in dist/
npm run preview    # serve the production build
```

`npm run dev` and `npm run build` copy the Tesseract worker, wasm core and
English model from `node_modules` into `public/tesseract/`, so the app never
loads OCR files from a CDN.

### Project layout

| Path | Purpose |
| --- | --- |
| `src/core/` | Framework-free logic: time parsing, PM4/PM5 parser, workout model, FIT export |
| `src/ocr/` | Image preprocessing, Tesseract worker and OCR asset caching |
| `src/components/` | Vue components for the review table |
| `src/locales/<lang>/i18n.json` | Translations; every locale must have the same keys |
| `scripts/` | Build helpers |

### Adding a language

Create `src/locales/<code>/i18n.json` with the same keys as
`src/locales/en/i18n.json` and register it in `src/i18n.ts`. A test fails if a
locale is missing keys.

## Limitations

- OCR accuracy depends heavily on the photo. Always check the review table
  before exporting.
- The PM4 and PM5 do not show a per-stroke history on the results screen, so the FIT
  file has per-lap values with evenly spaced samples within each lap, not
  stroke-by-stroke data.

## License

[MIT](LICENSE).

The FIT export uses the [Garmin FIT JavaScript SDK](https://github.com/garmin/fit-javascript-sdk),
which is distributed under the FIT Protocol License.

ErgScan is an independent project and is not affiliated with or endorsed by
Concept2 or by the makers of the ErgScan app on the App Store and Google Play.
