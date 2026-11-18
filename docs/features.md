# Features

[← Back to README](../README.md)

## Scanning

- Take a photo of the PM4/PM5 results screen, or pick an image you already have.
  A step-by-step guide shows how to reach the results screen on a PM5 or PM4.
- Finds the LCD in the image before reading it, so cropped photos and
  screenshots of social media posts work as well as close-ups.
- Offline OCR with [Tesseract.js](https://github.com/naptha/tesseract.js),
  with image thresholding to cope with glare and uneven light on the LCD.
- Parses the PM4/PM5 table: time, meters, split (/500m or /1000m), stroke rate,
  and heart rate, watts or calories. Rest intervals are detected.
- Long workouts that do not fit on one screen: when the splits fall short of
  the total, scroll the monitor down and scan the next rows. Rows shared by
  both photos are kept once.
- Manual entry when no photo is at hand.

## Reviewing a workout

- Editable review table to fix anything the OCR got wrong, add or remove rows,
  set the start time and recalculate the total. Unsaved edits survive a reload.
- Time in heart rate zones (60/70/80/90% of max) on the result page, using a
  measured max heart rate or one estimated from your age.
- Reads the drag factor and keeps it with the workout.
- Name workouts and add notes; both are written into the FIT file.
- Rate how you felt, from weary to beaming. The face shows in the history list
  and goes into the FIT file as the session's workout feel.

## Exporting

- FIT export as an indoor rowing activity: one lap per split or interval, rest
  laps marked as rest, and per-lap distance, stroke rate, power and heart rate.
  Power is derived from pace when the screen has no watts column.
- Share the file straight to another app, or download it and upload it to
  Strava, Garmin Connect or intervals.icu.

## History and sync

- Saved workouts are kept in the browser and work offline.
- Optional [private sync](private-sync.md) on self-hosted deployments: link
  your phone, tablet and computer with a QR code and keep the same history on
  all of them. History is end-to-end encrypted before it leaves the device,
  and a recovery key restores it if you lose every linked device.

## App

- Settings for light or dark theme, accent color, heart rate, hiding the intro
  card and clearing all app data.
- Installable Material 3 PWA in English and Danish, with a bottom bar on phones
  and a navigation rail on wide screens.
