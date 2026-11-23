# Features

[← Back to README](../README.md)

## Scanning

- Take a photo of the PM4/PM5 results screen, or pick an image you already have.
  A step-by-step guide shows how to reach the results screen on a PM5 or PM4.
- Zoom the in-app camera by pinching the preview or tapping 1×, 2×, 4× or 8×,
  using the camera's own zoom so the photo keeps its detail. The controls only
  appear on cameras that can zoom, such as Chrome on Android and Safari on
  iPhone.
- On an iPhone with several back lenses the camera opens on the combined
  camera the native Camera app uses, so 0.5× and macro close-ups switch lens by
  themselves. Elsewhere the switch button only cycles the back cameras.
- Finds the LCD in the image before reading it, so cropped photos and
  screenshots of social media posts work as well as close-ups. When the splits
  don't add up to the total, it also finds the table by its column headings,
  reads that crop, and keeps whichever read checks out better.
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
- Add heart rate from a watch that recorded the same session: pick its FIT
  file, or the ZIP from Export Original in Garmin Connect. The recording is
  matched to the splits by stroke rate (or by when the watch first counted
  strokes), each split gets its average heart rate, the start time comes from
  the watch clock, and the second-by-second heart rate goes into the FIT file.
  Everything happens in the browser; undo takes it back.
- Time in the rowing training bands UT3, UT2, UT1, AT, TR and AN (from 55, 70,
  80, 85 and 90% of max heart rate) on the result page, using a
  measured max heart rate or one estimated from your age. With heart rate from
  a watch, every second counts towards its own zone.
- Reads the drag factor and keeps it with the workout.
- Name workouts and add notes; both are written into the FIT file.
- Rate how you felt, from weary to beaming. The face shows in the history list
  and goes into the FIT file as the session's workout feel.

## Exporting

- FIT export as an indoor rowing activity: one lap per split or interval, rest
  laps marked as rest, and per-lap distance, stroke rate, power and heart rate,
  plus heart rate for every second when it came from a watch.
  Power is derived from pace when the screen has no watts column.
- Share the file straight to another app, or download it and upload it to
  Strava, Garmin Connect or intervals.icu.

## History and sync

- Saved workouts are kept in the browser and work offline.
- Optional [private sync](private-sync.md) on self-hosted deployments: link
  your phone, tablet and computer with a QR code and keep the same history on
  all of them. History is end-to-end encrypted before it leaves the device,
  and a recovery key restores it if you lose every linked device.
- A local [MCP server](mcp.md) lets an AI agent such as Claude Code read your
  synced workouts. It decrypts them on your computer.

## App

- Settings for light or dark theme, accent color, heart rate, hiding the intro
  card and clearing all app data.
- Installable Material 3 PWA in English and Danish, with a bottom bar on phones
  and a navigation rail on wide screens.
- Feels like a native app on a phone: no pinch zoom or sideways page scroll,
  no text selection or link preview on a long press, a buzz when a photo is
  taken, read or saved, and the screen stays on while the camera is open and
  the photo is read.
