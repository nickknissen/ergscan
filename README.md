# ErgScan: Concept2 PM5 photo to Strava and Garmin

![ErgScan reads a photo of a PM5 results screen, shows the splits for review and shares them as a FIT file](.github/readme-demo.gif)

**Turn a photo of your Concept2 rowing machine monitor into a FIT file for
Strava, Garmin Connect or intervals.icu.** ErgScan is a free, open-source web
app for the Concept2 PM5 and PM4. No Bluetooth pairing, no ErgData and no
account: row first, photograph the screen afterwards.

## How it works

1. **Photograph** the results screen after your workout, or pick a photo you
   already have. An in-app guide shows how to get there on the monitor.
2. **Check** the splits ErgScan read from the photo and fix anything it got
   wrong.
3. **Export** a FIT file with every split or interval, pace, stroke rate,
   watts and heart rate, and upload it to Strava, Garmin Connect or
   intervals.icu.

## Features

- Reads the PM4/PM5 results table offline, including intervals, rest and long
  workouts photographed across several screens.
- Editable review table, workout names, notes and how the session felt.
- Time in heart rate zones and the drag factor for each workout.
- FIT export as an indoor rowing activity with one lap per split or interval.
- Workout history, plus optional end-to-end encrypted sync between your
  devices on self-hosted deployments.
- Installable, works offline, light and dark themes, English and Danish.

See [all features](docs/features.md).

## Tips for a good photo

- Hold the phone straight in front of the screen, not at an angle.
- Let the table fill most of the frame.
- Avoid reflections on the digits.

Text recognition depends on the photo, so always check the review table before
exporting.

## Privacy

Photos and text recognition never leave your device, and workouts are saved in
your browser. No ads, accounts or tracking. If you turn on
[private sync](docs/private-sync.md), your history is encrypted on the device
before it is sent.

## Run it yourself

```sh
docker build -t ergscan .
docker run -p 8080:80 ergscan    # open http://localhost:8080
```

Or develop locally with Node.js 20.19+ or 22.12+:

```sh
npm install
npm run dev
```

## Documentation

- [Features](docs/features.md): everything ErgScan does, in detail
- [FAQ](docs/faq.md): common questions and known limitations
- [Private sync](docs/private-sync.md): link devices and recover your history
- [Self-hosting](docs/self-hosting.md): Docker, the sync server and Coolify
- [Development](docs/development.md): scripts, OCR evaluation, project layout
  and translations

## License

[MIT](LICENSE). The FIT export uses the
[Garmin FIT JavaScript SDK](https://github.com/garmin/fit-javascript-sdk),
which is distributed under the FIT Protocol License.

ErgScan is an independent project and is not affiliated with or endorsed by
Concept2 or by the makers of the ErgScan app on the App Store and Google Play.
