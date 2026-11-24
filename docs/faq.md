# FAQ

[← Back to README](../README.md)

## How do I get a Concept2 rowing workout into Strava without ErgData?

Take a photo of the PM5, PM4 or PM3 results screen after the workout, check the
splits in ErgScan, and share or download the FIT file. Upload that file to
Strava, Garmin Connect or intervals.icu. Each split keeps its distance, pace,
stroke rate, power and heart rate.

## I forgot to connect my phone or watch before rowing. Can I still log the workout?

Yes. As long as the workout is in the monitor's memory, open it from the
PM5, PM4 or PM3 memory menu, photograph the results screen and export it. A
PM4 or PM3 with a LogCard inserted saves to the card instead, so look under LogCard Menu.
The in-app guide shows where to find it.

## My watch recorded the session too. Can I get its heart rate into the workout?

Yes. In Garmin Connect on the web, open the watch activity, choose the gear
menu and Export Original, then in ErgScan open the workout's ⋮ menu and pick
Add heart rate from watch. Choose the ZIP you downloaded, or a FIT file from
any watch. ErgScan lines the recording up with the splits, fills in each
split's heart rate, and puts the full heart rate graph in the exported FIT
file. Once you upload that file you can delete the watch's own activity, so the
session isn't counted twice.

## Does it work with interval workouts?

Yes. Each interval becomes its own lap, and rest intervals are exported as
rest laps.

## Which rowers does it work with?

The Concept2 RowErg (Model D and Model E) with a PM5, PM4 or PM3 monitor, on
iPhone, Android and desktop.

## Do I need to install an app?

No. ErgScan is a progressive web app that runs in the browser. You can add it
to the home screen and use it offline.

## Can I see my workouts on several devices?

Yes, on a deployment with private sync enabled. See
[Private sync](private-sync.md) for how to link devices and recover your
history.

## Can I lose my saved workouts?

They live in your browser, so clearing site data deletes them, and Safari on
iPhone and iPad deletes the data of a site you haven't opened for seven days
unless it was added to the home screen. To keep them safe, add ErgScan to the
home screen, turn on [private sync](private-sync.md), or use **Settings →
Export history** now and then and keep the file somewhere else. **Restore from
file** brings the workouts back in any browser. The FIT files you upload to
Strava or Garmin Connect are a copy too.

## Is it free?

Yes, free and open source under the MIT license, with no ads, accounts or
tracking.

## Limitations

- OCR accuracy depends heavily on the photo. Always check the review table
  before exporting.
- The PM3, PM4 and PM5 do not show a per-stroke history on the results screen, so
  the FIT file has per-lap values with evenly spaced samples within each lap,
  not stroke-by-stroke data.
