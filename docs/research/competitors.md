# Competitive analysis: getting a finished erg workout into a training log

[← Back to README](../../README.md)

Researched 2026-11-24. Store figures (ratings, prices, update dates) are what
the listings showed on that day, US storefront unless noted. Store pages often
omit the year on dates; where a year is missing it is left out here too.
Google Play reviews were read through Play's public review feed for the listing
linked; App Store reviews are the handful the listing page shows. Anything not
confirmed from a primary source is marked **unverified**. Our own features are
taken from [README](../../README.md), [features](../features.md) and
[FAQ](../faq.md). ErgManiac, ErgTracker and the unrelated store app
`com.ergscan` were also analysed statically from their Android apps; those
notes are kept outside the repository. "Static analysis" below refers to them.

To avoid confusion, this document calls the store app **"ErgScan (store app)"**
and ours **ErgScan**.

## Comparison at a glance

✅ yes · ❌ no · 🟡 partial · ❔ not verified · ➖ not applicable.
"ErgScan (store)" is the unrelated store app `com.ergscan`. Sources are the
profiles in section 2. For ErgScan: [features](../features.md) and
[FAQ](../faq.md).

| Feature | **ErgScan** | ErgScan (store) | ErgManiac | Watta | ErgTracker | ErgPal | Ergbase | Erg Analyzer | ErgBot (dormant) | Power Ten Metrics | ErgData + Logbook | ErgZone | RowIQ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Photo or OCR input | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 (not in EU/UK/CH) | ✅ | ❔ | ❌ | ❌ | ❌ |
| OCR on the device, offline | ✅ | ❌ (cloud LLM) | ❌ (cloud) | ❌ (cloud) | ❌ (cloud) | ❔ | ❌ (cloud) | ❌ (Gemini) | ❌ (cloud) | ❔ | ➖ | ➖ | ➖ |
| Unlimited free scans | ✅ | ❌ (limit) | ❌ (1 scan) | ✅ | 🟡 (10, then an ad per scan) | ❌ (subscription) | ❔ | 🟡 (outside Europe) | ✅ | ❔ | ➖ | ➖ | ➖ |
| Several screens merged into one workout | ✅ | ❔ | ✅ | ✅ | ❌ (bulk is Pro) | ✅ | ❔ | ❔ | ❌ (max 8 splits) | ❔ | ➖ | ➖ | ➖ |
| Live Bluetooth from the PM5 | ❌ | ❌ | ✅ | 🟡 (sends workouts) | ❌ | ❌ | ❌ | ❌ | ❌ | ❔ | ✅ | ✅ | ✅ |
| Manual entry | ✅ | ❔ | ✅ | ✅ | ❌ | 🟡 (edit only) | ❔ | ✅ | ❌ | ❔ | ✅ (web) | ❔ | ❔ |
| PM3 | ❌ | ❔ | ✅ | ✅ | ❌ | ❔ | ❔ | ❔ | ❔ | ❔ | ❌ | ❔ | ❌ |
| PM4 | ✅ | ❔ | ✅ | ✅ | ❌ | ❔ | ❔ | ❔ | ❔ | ❔ | ❌ | ❌ (USB) | ❌ |
| SkiErg and BikeErg | ❌ | ❌ | ❔ | ✅ | ❌ | ❔ | ❔ | ❔ | ❔ | ❔ | ✅ | ✅ | 🟡 (BikeErg) |
| FIT export | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❔ | 🟡 (Logbook download) | ✅ (to intervals.icu) | ❌ |
| CSV or spreadsheet export | ❌ | ✅ | 🟡 (Pro "export") | ❌ | 🟡 (per workout) | ✅ | ❌ | ✅ (+ JSON) | ✅ (Google Sheet) | ❔ | 🟡 (Utility CSV) | ❌ (asked for) | ❌ |
| Strava | 🟡 (file) | ✅ | ✅ | ✅ | 🟡 (totals only) | ❌ | ❌ | ❌ | ❌ | ❔ | ✅ (through Logbook) | ✅ (through Logbook) | ✅ |
| Garmin Connect | 🟡 (file) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❔ | ✅ (through Logbook) | 🟡 (through Logbook) | ❌ |
| Concept2 Logbook upload | ❌ | ✅ (Premium) | ❔ (Pro "auto-sync", may be import only) | ❌ (import only) | ❌ | ❌ | ❌ | ❌ (import only) | ❌ | ❔ | ✅ | ✅ | ✅ |
| intervals.icu | 🟡 (file) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❔ | ✅ (pulls from Logbook) | ✅ (beta, paid) | ❌ |
| TrainingPeaks | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❔ | ✅ (through Logbook) | 🟡 | ❌ |
| Heart-rate zones | ✅ | ✅ | ✅ (Pro) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❔ | ✅ | ✅ | ✅ |
| Merge heart rate from a watch FIT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (TCX only) | ❌ | ❔ | 🟡 (Apple Watch live) | ❌ | ❌ |
| Drag factor | ✅ | ❔ | ✅ | ✅ | ❌ | ❌ | ❌ | ❔ | ❌ | ❔ | ✅ | ✅ | ❔ |
| History | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Personal bests and trends | ❌ | ✅ | ✅ | ✅ | 🟡 (calendar) | 🟡 ("insights") | 🟡 | ✅ (deep) | ❌ | ✅ | 🟡 | ✅ | ✅ |
| Training plans or coach | ❌ | ❌ | ✅ (AI, Pro) | ✅ (coach) | ❌ | ❌ | ❌ | 🟡 (AI prompt export) | ❌ | 🟡 (coach-set workouts) | 🟡 (WOD) | ✅ | ✅ (AI, paid) |
| Social, clubs, leaderboards | ❌ | 🟡 | ✅ | ✅ | ❌ | ❌ | ❌ | 🟡 (team comparison) | 🟡 (Team Mode, paid) | ✅ (teams) | ✅ (rankings) | ✅ | ✅ |
| Shareable summary image | ❌ | ✅ | ✅ (link) | ❌ | ✅ | ❌ | ❌ | ✅ (PNG) | ❌ | ❔ | ✅ (Strava image) | ❔ | ❔ |
| Works without an account | ✅ | ❔ | ❌ | ❌ | 🟡 (hidden anonymous account) | ❔ | ❌ | ✅ | ❌ (Google) | ❌ | ❌ | 🟡 (guest) | ❌ |
| No ads or tracking | ✅ | ❌ (label) | 🟡 (PostHog) | 🟡 (PostHog, Sentry) | ❌ (ads) | 🟡 | ❌ (label) | 🟡 (Vercel analytics) | ❌ (label) | 🟡 (label) | 🟡 | 🟡 | ❌ (label) |
| Works offline | ✅ | ❌ | ❌ | 🟡 (queues saves, scans need network) | ❔ | ❔ | ❌ | ❌ | ❌ | ❔ | 🟡 | ❌ ("need wifi") | ❔ |
| Open source | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Web or desktop | ✅ (PWA) | ❌ | ✅ | ❌ | ❌ | 🟡 (Mac) | ❌ | ✅ (web only) | 🟡 (team web) | ✅ (dashboard) | ✅ (Logbook web) | ✅ (dashboard) | 🟡 (Mac) |
| Price | Free | Free + $4.99/mo… | €2.99/mo | Free | Free + ads | $8.99/mo | Free | Free | Free (Team Mode paid) | $0.99/mo | Free | $4.99/mo | $9.99/mo |

## 1. Summary

**The market.** There are three ways to get a Concept2 workout into Strava,
Garmin or intervals.icu:

1. **Bluetooth during the row.** Concept2's own ErgData, plus ErgZone, RowIQ,
   EXR, PainSled and others, upload to the Concept2 Logbook. The Logbook then
   forwards to Strava, Garmin Connect and TrainingPeaks
   ([Concept2 blog](https://concept2.com/blog/connecting-to-strava-garmin-connect-training-peaksand-more)),
   and intervals.icu now pulls from the Logbook directly
   ([intervals.icu forum](https://forum.intervals.icu/t/concept2-integration-now-available/113001)).
2. **USB stick and Concept2 Utility** on a computer
   ([Concept2](https://concept2.co.uk/service/software/concept2-utility/how-to-use/uploading-results-to-online-logbook)).
3. **A photo of the monitor.** This is a young, crowded niche. Six store apps
   do it: ErgScan (store app), ErgManiac, Watta, ErgTracker, ErgPal and
   Ergbase. Most of them launched or relaunched in 2025-2026. All of them use
   a paid or account-based cloud service, except ErgTracker, which is
   ad-funded. None exports a FIT file. Two more read photos: Erg Analyzer, a
   free web analysis tool that sends photos to Google Gemini and hides photo
   entry in Europe (2.16), and ErgBot, an iPhone app that Power Ten Metrics
   bought in 2024 and has not updated since 2021 (2.17, 2.18).

**Where ErgScan already leads.**

- **The only free, unlimited, offline scanner with no account.** ErgManiac
  gives 1 free scan, then €2.99/month
  ([pricing](https://ergmaniac.com/pricing)). ErgTracker gives 10 free credits
  and shows ads
  ([App Store](https://apps.apple.com/us/app/ergtracker-scan-share/id6758005288)).
  ErgPal costs $8.99/month, $39.99/year or $129.99 lifetime
  ([App Store](https://apps.apple.com/us/app/rowing-tracker-ergpal/id6770650039)).
  Watta needs an account ([download page](https://getwatta.com/download)).
  ErgScan (store app) has a premium tier, and a user says "scan limitation is a
  problem for anyone other than very casual rowers"
  ([Play](https://play.google.com/store/apps/details?id=com.ergscan)).
- **The only scanner with FIT export.** The others offer an image, CSV or a
  cloud sync to Strava. That makes ErgScan the only one that reaches Garmin
  Connect and intervals.icu without a middleman, with per-lap pace, stroke
  rate, power and heart rate.
- **Photo reading in Europe.** Erg Analyzer turns photo entry off for EU/EEA,
  UK and Swiss browsers because its photos go to a cloud model (2.16).
  ErgScan reads the photo on the phone, so it works everywhere.
- **Merging heart rate from a watch.** No competitor found does this. Watta
  says outright that it "doesn't read heart rate from a watch"
  ([getwatta.com](https://getwatta.com/)).
- **Privacy and open source.** Every competitor's App Store privacy label
  lists data linked to the user, and ErgTracker's also lists tracking for
  advertising. Only OpenRowingMonitor is also open source, and it is a
  different product (see 2.14).
- **A rescue path when ErgData fails.** ErgData's Play reviews are full of
  lost workouts (section 4). The PM5 keeps the splits in memory
  ([c2forum](https://c2forum.com/viewtopic.php?p=576446)), so a photo
  recovers what Bluetooth lost.

**Biggest gaps.**

- **No direct upload anywhere.** Every competitor with traction pushes to
  Strava or the Concept2 Logbook automatically. ErgScan makes the user
  download a file and upload it by hand. intervals.icu can be fixed without a
  backend (recommendation R1).
- **No Concept2 Logbook upload.** The Logbook is the hub that rankings,
  challenges and every downstream sync hang off.
- **RowErg only, PM4/PM5 only.** Watta covers SkiErg, BikeErg and the PM3
  ([Play](https://play.google.com/store/apps/details?id=com.utx.app)), and
  ErgManiac covers the PM3 ([ergmaniac.com](https://ergmaniac.com/)).
- **Hard to find.** ErgScan is not in any store, and it shares its name with a
  store app that has 1K+ Play downloads.
- **Analytics are thin.** ErgScan has no personal bests, trends or "every 2k
  I've rowed" view, and ErgData users ask for exactly that.

## 2. Competitor profiles

### 2.1 ErgScan (store app, `com.ergscan`, unrelated to us)

- **Platform:** iOS and Android. Developer BUNEME KYAKILIKA
  ([App Store](https://apps.apple.com/us/app/ergscan-rowing-workouts-log/id1661654775)).
- **Price:** Free, with Premium $12.99, Annual $29.99, Weekly $1.99 and
  Monthly $4.99 ([App Store](https://apps.apple.com/us/app/ergscan-rowing-workouts-log/id1661654775)).
  A Play review mentions a scan limit on the free tier
  ([Play](https://play.google.com/store/apps/details?id=com.ergscan)). The
  exact free quota is **unverified**.
- **Ratings:** 4.9 from 13 ratings on iOS, version 1.21, Nov 9. On Play:
  4.8, 1K+ downloads, last updated Jan 15, 2026
  ([Play](https://play.google.com/store/apps/details?id=com.ergscan)).
- **Input:** Photo, read by cloud AI. Our static analysis found an on-device
  YOLO header detector, Mistral OCR and OpenAI chat completions
  (static analysis).
- **Exports:** Strava, TrainingPeaks and the Concept2 Logbook, all synced
  through a Supabase backend. Also CSV and text. No FIT
  (static analysis; release notes 1.14 and 1.16 on the
  [App Store](https://apps.apple.com/us/app/ergscan-rowing-workouts-log/id1661654775)).
- **Analytics:** Heart-rate zone chart, goals, benchmarks, search, and a
  Premium feature that compares past workouts at the same distance
  (App Store release notes).
- **Account and privacy:** The privacy label lists identifiers used to track
  the user. The app uses Firebase, Mixpanel and Crashlytics
  (static analysis).
- **Complaints:** Intervals are uploaded to the Logbook as fixed distance,
  "the meters for each interval are displayed as a cumulative total"
  (4★, Jan 2026). "doesnt work with planet fitness matrix brand rowers"
  (3★, Mar 2026). The scan limit (above)
  ([Play](https://play.google.com/store/apps/details?id=com.ergscan)).

### 2.2 ErgManiac

- **Platform:** Android app and web. No iOS app is mentioned
  ([ergmaniac.com](https://ergmaniac.com/)).
- **Price:** Free tier with **1 starter scan that does not reset**. Pro costs
  €2.99/month or €29.99/year plus VAT, with unlimited scans, Logbook
  auto-sync, AI plans and coach, and data export. The 30-day trial needs a
  payment method and includes 3 scans
  ([pricing](https://ergmaniac.com/pricing)).
- **Ratings:** 4.7 on Play, 10+ downloads, updated Oct 8, 2026
  ([Play](https://play.google.com/store/apps/details?id=com.ergmaniac.app)).
- **Input:** Photo (PM3, PM4 and PM5, up to 5 photos per workout), Concept2
  Logbook sync, manual entry, and live PM5 over Bluetooth. The scan runs in
  the cloud
  (static analysis;
  [blog](https://ergmaniac.com/blog/how-to-log-concept2-workouts-photo-scan)).
- **Exports:** Concept2 Logbook sync (free tier imports from the Logbook; whether Pro
  "auto-sync" also writes to it is **unverified**) and Strava connect. The app has no
  FIT, TCX or CSV export (static analysis). Pro
  advertises "data export" in an unstated format.
- **Analytics:** Personal bests, fitness score with an estimated 2K, trends,
  heart-rate reserve zones, a split-consistency score, an AI coach, technique
  video, clubs and badges (static analysis;
  [ergmaniac.com](https://ergmaniac.com/)).
- **Account:** Required. Signup asks for age, weight and max heart rate
  ([ergmaniac.com](https://ergmaniac.com/)). The app uses PostHog analytics
  (static analysis).
- **Complaints:** No written reviews were visible.

### 2.3 Watta (Polar Industries Ltd)

- **Platform:** iOS and Android (`com.utx.app`)
  ([download](https://getwatta.com/download)).
- **Price:** "Free, no subscription." A technique check is an optional paid
  in-app purchase ([Play](https://play.google.com/store/apps/details?id=com.utx.app)).
- **Ratings:** 5.0 from 3 ratings on iOS, version 2.0.1, Nov 2
  ([App Store](https://apps.apple.com/us/app/watta/id6758580968)). 50+ Play
  downloads, updated Oct 29, 2026
  ([Play](https://play.google.com/store/apps/details?id=com.utx.app)).
- **Input:** Photo, with several screens read as one workout. Since 2.0.0 it
  can also send a workout to the PM5 over Bluetooth. It covers RowErg, SkiErg
  and BikeErg on the PM5, PM4 and PM3
  ([App Store](https://apps.apple.com/us/app/watta/id6758580968);
  [getwatta.com](https://getwatta.com/)).
- **Exports:** Pushes to Strava. Imports from the Concept2 Logbook read-only
  and never writes back. No Garmin, FIT or CSV
  ([getwatta.com](https://getwatta.com/)).
- **Analytics:** A 0-100 Effort Score, Karvonen heart-rate zones, personal
  bests, goals, streaks, 30 badges, clubs, leaderboards and coach plans
  ([Play](https://play.google.com/store/apps/details?id=com.utx.app)).
- **Account:** Required (Apple, Google or email)
  ([download](https://getwatta.com/download)).
- **Verified in the Android app (v2.0.1, static analysis):**
  - OCR runs in the cloud: photos are compressed and POSTed to `/workouts/ocr`
    on their Railway backend. There is no on-device text recognition.
  - No scan limit or paywall around scanning was found.
  - Workouts keep machine type (row, ski, bike), distance, time, split, rate,
    watts, heart rate, calories, drag factor and notes. They are private by
    default unless the user changes the default.
  - Strava and Concept2 Logbook connections both run through their server.
    The Logbook link imports only. The app handles a `STRAVA_AT_CAPACITY`
    error, which suggests their Strava app hit its athlete limit.
  - No CSV, FIT or TCX export.
  - PostHog analytics tracks scan events, including each OCR field the user
    corrects, and Sentry reports crashes.
  - The technique check ("Film 30 seconds of rowing") has no endpoint in the
    app's API map, so how it works is unverified.
- **Notable:** Watta runs aggressive SEO comparison pages ("Best Rowing App
  2026"). They say photo apps like ErgScan and ErgTracker "stop at the log"
  ([getwatta.com/vs/best-rowing-app](https://getwatta.com/vs/best-rowing-app)).

### 2.4 ErgTracker: Scan & Share (Thibault Marichal)

- **Platform:** iOS and Android
  ([App Store](https://apps.apple.com/us/app/ergtracker-scan-share/id6758005288);
  [Play](https://play.google.com/store/apps/details?id=com.niewerdsorganization.ergtracker)).
- **Price:** Free with ads. Pro is a one-time purchase (Remove Ads, $4.99 on
  the App Store) that removes ad gates and adds bulk scanning. Version 1.1.4
  (Jun 4) added "10 free PM5 scan credits" (App Store).
- **Ratings:** Not enough ratings to show on iOS. 10+ Play downloads, updated
  Jun 4, 2026, with no update since.
- **Input:** Photo of the PM5 only. Reads distance, time, splits, rate and
  heart rate, for intervals and steady state.
- **Exports:** A summary **image**, a direct Strava upload, and a CSV.
- **Account and privacy:** "No account is required", and workouts are stored
  on the device. But the iOS privacy label lists location, identifiers and
  usage data used to track the user for third-party advertising (App Store).
- **Verified in the Android app (v1.1.4, static analysis):**
  - OCR runs in the cloud: photos are POSTed to a Google Cloud Run service in
    Europe. There is no on-device text recognition.
  - The 10 free credits are ad-free scans counted on the phone. After that
    every scan upload, and every save, waits for an interstitial or rewarded
    ad unless the user has Pro. The server can also refuse with "Scan limit
    reached."
  - "No account" means a hidden anonymous Firebase account; each scan sends
    its token and a device ID.
  - The Strava upload is a manual activity with only name, type, start time,
    elapsed time and distance. No splits, laps or heart rate reach Strava.
  - The CSV has one row per workout (totals, average HR, interval count, tag,
    notes), not per split.
  - No watts, calories or drag factor anywhere in the app. The cropped photo
    is kept with each workout.

### 2.5 ErgPal: Rowing Tracker (Robert Alan Neithart / "Rob's Apps")

- **Platform:** iOS, iPadOS, macOS on Apple silicon and visionOS
  ([App Store](https://apps.apple.com/us/app/rowing-tracker-ergpal/id6770650039)).
- **Price:** $8.99/month, $39.99/year with a 7-day trial, or $129.99 lifetime.
- **Ratings:** 5.0 from 1 rating. Version history was not shown.
- **Input:** "AI-powered" photo scan, with several screens merged into one
  interval workout. "No Bluetooth", and parsed data can be edited.
- **Exports:** Google Sheets, Excel and CSV. Strava, Garmin, the Logbook and
  FIT are not mentioned.
- **Privacy:** The label links health and fitness data, email, photos and
  identifiers to the user. Whether an account is required is **unverified**.

### 2.6 Ergbase Rowing (Stuart Sim)

- **Platform:** iOS ([App Store](https://apps.apple.com/us/app/ergbase-rowing/id6446604086)).
- **Price:** Free. The label lists purchase history, but no IAP is listed.
- **Ratings:** The rating "was recently reset". Version 2.1.1 came out
  04/24/2025, with no update since.
- **Input:** Photos uploaded to Ergbase, which turns them into searchable data.
  It is a cloud service, and the release notes mention logging in.
- **Exports:** None mentioned.
- **Complaint:** "Doesn't function well at all, counts down and just does
  nothing" (05/13/2024).
- **Assessment:** Small, and apparently dormant since April 2025.

### 2.7 Concept2 ErgData and the Concept2 Logbook (official)

- **Platform:** iOS, watchOS and Android. Free
  ([App Store](https://apps.apple.com/us/app/ergdata/id561716382);
  [Play](https://play.google.com/store/apps/details?id=com.concept2.ergdata)).
- **Ratings:** **4.8 from 6.7K ratings on iOS, but 2.8 from 2.53K reviews on
  Play** (500K+ downloads, updated Oct 27, 2026).
- **Input:** Bluetooth to the PM5 only. It does not support the PM4 or PM3
  ([Play](https://play.google.com/store/apps/details?id=com.concept2.ergdata)).
  The Logbook website also accepts manual entry. A forum user found that the
  form only takes time and distance for an interval workout (**unverified**
  for the current form;
  [c2forum](https://c2forum.com/viewtopic.php?p=563141)).
- **Exports:** Auto-sync to the Logbook. From there it goes to Strava, Garmin
  Connect and TrainingPeaks, but only for new workouts, and the Strava image
  only appears for public workouts
  ([Concept2 blog](https://concept2.com/blog/connecting-to-strava-garmin-connect-training-peaksand-more)).
  intervals.icu pulls from the Logbook
  ([forum](https://forum.intervals.icu/t/concept2-integration-now-available/113001)).
  Apple Health and Google Fit are supported. Workouts sent from the Logbook to
  Garmin are not counted in Garmin's Training Status
  ([Concept2](https://www.concept2.com/node/13266)).
- **Analytics:** Post-workout graphs, heart-rate zones, Workout of the Day and
  challenges.
- **Account:** Required (Concept2 Logbook).
- **Complaints (Play):** Lost workouts, battery drain, Bluetooth drops, login
  failures and forced accounts. See section 4.

### 2.8 Concept2 Utility and USB

The PM5 can save to a USB stick, and Concept2 Utility on Windows or Mac
uploads that to the Logbook. A CSV export exists, but "you cannot upload
results to your online logbook from a .csv"
([Concept2](https://concept2.co.uk/service/software/concept2-utility/how-to-use/transferring-results-to-spreadsheet)).
A forum user warns that moving a workout to USB deletes it from PM5 memory,
and the Utility has no Android version
([c2forum](https://c2forum.com/viewtopic.php?p=429677);
[c2forum](https://c2forum.com/viewtopic.php?p=563141)).

### 2.9 ErgZone (Bluetooth, the leading third-party app)

- **Platform:** iOS, Android and a web dashboard. Works with Concept2, RP3,
  Rogue, WaterRower and FTMS machines
  ([Play](https://play.google.com/store/apps/details?id=zone.erg)).
- **Price:** Free core. ErgZone+ costs $4.99/month or $49.99/year
  ([App Store](https://apps.apple.com/us/app/ergzone/id1474566270)).
- **Ratings:** 4.8 from 518 on iOS. 4.8 from 489 reviews on Play, 10K+
  downloads.
- **Exports:** Auto-upload to the Concept2 Logbook. A beta two-way
  intervals.icu integration (Feb 2026) uploads FIT files and needs ErgZone+
  ([forum](https://forum.intervals.icu/t/ergzone-intervals-icu-integration-beta-row-ski-bike-run/121833)).
- **Analytics:** Benchmark-based pacing, heart-rate and power zones, force
  curve (premium), communities and leaderboards.
- **Complaints (Play):** "premium required for hr monitor" (1★, Mar 2026).
  Losing the Bluetooth connection and the workout (2★, Feb 2026). "Would love
  to have it all in a CSV download" (Jul 2026). No direct Garmin link (4★,
  May 2025, and 5★, May 2026). "Need wifi, which I don't have in my garage"
  (2★, 2022).

### 2.10 RowIQ (Bluetooth, AI coach)

- **Platform:** iOS, iPadOS, macOS and visionOS. PM5 only, RowErg and
  BikeErg. "The SkiErg and the older PM3/PM4 monitors are not supported"
  ([App Store](https://apps.apple.com/app/id6761737498)).
- **Price:** Premium $9.99/month or $3.99/week, an $89.99 plan, and coach
  plans up to $349.99.
- **Ratings:** 4.4 from 14.
- **Exports:** Logbook auto-upload, Strava and Apple Health.
- **Account:** "An account is now required" (release 1.28.2). The privacy
  label lists a user ID for third-party advertising.

### 2.11 PainSled

Bluetooth to the PM5, and USB to the PM2-PM5 through the iConnect cable. It
exports TCX and CSV and syncs to the Logbook, Strava, TrainingPeaks and others.
The US App Store page returned 404 on 2026-11-24. A $24.99 price and a $9.99
Strava add-on come from older regional listings and are **unverified**
([App Store GB](https://apps.apple.com/gb/app/painsled/id1069679171);
[Chrome Web Store](https://chromewebstore.google.com/detail/painsled-indoor-rowing-da/ghbmenofmepjomdkhinghoglaifnlgmp?hl=en)).

### 2.12 Brief: other live and Bluetooth platforms

- **EXR:** 3D virtual rowing. 14-day trial, then €9.95/month. Syncs to Strava,
  the Concept2 Logbook, Apple Health and TrainingPeaks
  ([exrgame.com](https://www.exrgame.com/)).
- **RowPro 5 (PC):** Works with the PM3, PM4 and PM5. Exports through the
  Concept2 Logbook to TrainingPeaks and Strava
  ([digitalrowing.com](https://digitalrowing.com/products)).
- **CrewNerd:** Exports directly to intervals.icu, according to the
  Rowsandall developer
  ([forum](https://forum.intervals.icu/t/support-for-rowing-data-migrating-from-rowsandall-com/117915?page=2)).
  Its erg-mode details are **unverified**.
- **Asensei, Kinomap, Regatta, Ergatta, Aviron, Hydrow, Peloton, FIIT, Apple
  Fitness+:** Classes, games or video, listed on
  [Concept2's apps page](https://www.concept2.com/apps). None scans photos.
  Their prices were not researched.
- **Garmin watches:** Can pair to the PM5 as ANT+ fitness equipment on newer
  models, or through the ErgIQ Connect IQ app. The PM5 has one Bluetooth data
  connection, so a watch and ErgData compete for it
  ([Concept2](https://www.concept2.com/node/13266);
  [Suunto forum](https://forum.suunto.com/post/187853), a forum claim).

### 2.13 Platforms on the receiving end

- **intervals.icu:** Pulls from the Concept2 Logbook since 3 Oct 2025, one-way
  ([forum](https://forum.intervals.icu/t/concept2-integration-now-available/113001)).
  Users reported rest periods with zero power and cadence, later fixed. Every
  user has a personal API key, and the API accepts FIT uploads
  ([open API](https://www.intervals.icu/features/open-api/)). **We checked on
  2026-11-24 that its API answers a CORS preflight from an arbitrary origin**
  with `access-control-allow-origin` reflected and the `authorization` header
  allowed, so a browser can upload directly.
- **Rowsandall:** The rowing analytics site **is shutting down around
  December 2026**, and its functions are moving to intervals.icu. The code was
  open-sourced in January 2026
  ([forum](https://forum.intervals.icu/t/support-for-rowing-data-migrating-from-rowsandall-com/117915)).
- **Strava:** Accepts FIT, TCX and GPX through its web uploader
  ([Strava support](https://support.strava.com/hc/en-us/articles/223297187-How-to-get-your-Activities-to-Strava);
  [API uploads](https://developers.strava.com/docs/uploads/)). Its OAuth token
  exchange requires the client secret
  ([Strava auth docs](https://developers.strava.com/docs/authentication/)).
  Whether the Strava mobile app imports files is **unverified**. Third-party
  iOS apps such as StraUpload exist to fill that gap: 15 free uploads, then
  $3.99 ([App Store](https://apps.apple.com/us/app/straupload/id1297360974)).
- **Concept2 Logbook API:** OAuth with `results:write`. `POST
  /api/users/me/results` takes `type`, `date` (the **end** of the workout),
  `distance`, `time` in tenths, `weight_class`, `workout_type`, `rest_time`
  and `rest_distance`, `drag_factor`, `heart_rate`, `comments`, and
  `workout.splits` or `workout.intervals`. Duplicates are rejected with 409.
  Only trusted clients can set `verified`. The token endpoint requires the
  `client_secret`, and live write access needs Concept2's approval after
  development on log-dev
  ([API docs](https://log.concept2.com/developers/documentation/);
  [developer home](https://log.concept2.com/developers/home)). The API also
  answered CORS preflights with `access-control-allow-origin: *` in our check.

### 2.14 Open source

- **OpenRowingMonitor** (GPL-3.0): A Raspberry Pi monitor for non-Concept2
  rowers. Exports FIT, TCX and RowingData CSV, and uploads automatically to
  Strava, intervals.icu and Rowsandall
  ([GitHub](https://github.com/JaapvanEkris/openrowingmonitor)). It
  complements ErgScan rather than competing with it.
- **Rowsandall:** Open-sourced while shutting down (above).

### 2.15 Scanners for other gym machines

TreadLog reads treadmill consoles on the device
([App Store](https://apps.apple.com/app/id6780434604)). GymReader on iPad
writes treadmill readings to Apple Health
([App Store](https://apps.apple.com/us/app/id6761631557)). An ABC Trainerize
user asked for OCR of treadmill screens
([ideas forum](https://ideas.abcfitness.com/forums/940789-client-gym-members-abc-trainerize/suggestions/34690408-use-optical-character-recognition-to-record-stats)).
These listings were only skimmed, so their details are **unverified**.

### 2.16 Erg Analyzer (Form & Signal, web)

- **What:** A free web app at [erg.form-signal.com](https://erg.form-signal.com/)
  that analyses Concept2 workouts after the fact. It is an analysis tool,
  not a converter. Its meta description: "pacing, durability, cardiac
  decoupling, interval breakdowns, and 2K benchmarks. Free, no account
  required." The served HTML holds only meta tags, so the facts below come
  from its public JS bundle (`/assets/index-C9NDZ08G.js`, version 6.2.0,
  read 2026-11-24).
- **Maker:** Form & Signal, which calls itself an "independent research and
  analytics consultancy" ([about](https://www.form-signal.com/about.html);
  [products](https://www.form-signal.com/products)). It says "There is no
  public contact information"; the legal text gives only a Gmail address. Who
  is behind it is **unverified**. Closed source ("All rights reserved").
- **Platform:** Web app on Vercel with serverless `/api/*` routes. No web app
  manifest or service worker, so it can't be installed and doesn't work
  offline. No store listing or GitHub repo found.
- **Price:** Free. "A non-commercial project, free to use. We do not sell data
  or subscriptions."
- **Input:**
  - Concept2 Logbook OAuth with auto-sync. It pulls results and per-stroke TCX
    through its own `/api/c2-proxy`.
  - CSV or TCX upload from Concept2 or ErgData exports.
  - Manual split entry, including rest rows.
  - A PM5 photo, read **server-side by Google Gemini** after a consent
    checkbox ("I understand this photo is uploaded to Google's Gemini
    API…"). The user confirms the parsed splits.
- **Photo entry is hidden in Europe.** If any browser language region is in
  the EU/EEA, the UK or Switzerland (a hard-coded list that includes DK and
  GB), the user sees "Photo entry isn't offered in your region — enter the
  splits below." The reason (GDPR, Gemini terms) is inferred, not stated.
- **Exports:** No FIT, and nothing sent to Strava, Garmin, intervals.icu or the
  Logbook. It offers per-view CSV and PNG, and a full JSON export whose
  `instructions` field is a prompt telling an AI chatbot to act as "an
  experienced rowing coach", with a citation library and training plans (Pete
  Plan, Wolverine, Norwegian double threshold and others). It is a
  bring-your-own-AI coaching handoff.
- **Analytics:** Very deep, each metric with a formula and DOI citations:
  pacing against PB, cardiac decoupling (Pw:HR), cardiac drift, W′bal,
  critical power and W′, a power-duration curve, 2K projections, VO₂max
  estimate, TRIMP/TSS and ATL/CTL, ranked repeat workouts, a PR tracker, and
  protocol views for Norwegian 4×4 and 30r20. It explains which tier of
  analysis the data supports ("HR-Free Mode" without heart rate). The
  dashboard needs at least 5 sessions.
- **Heart rate:** From TCX per-stroke samples. No import of a separate watch
  FIT file found.
- **Account and privacy:** No account; data in IndexedDB and localStorage. It
  says "local-first", but data may go "transiently to Vercel serverless
  functions", model endpoints run server-side, photos go to Gemini, it uses
  cookie-free Vercel analytics, and there is an 18+ age gate and disclaimer
  before first use.
- **User feedback:** None found in web searches.

### 2.17 Power Ten Metrics

- **What:** Rowing analytics for individuals and teams: "real-time data
  visualization and performance trend analysis", workout planning, and
  coach-published workouts with athletes' results
  ([website](https://powertenmetrics.com);
  [JRN, 2025-04-02](https://jrn.news/jrn-and-power-ten-metrics-announce-partnership/)).
  Not to be confused with Power Ten Development LLC, which makes Remote Rowing
  Coach and RowingSTEM.
- **Platform:** iPhone (iOS 17+)
  ([App Store](https://apps.apple.com/us/app/power-ten-metrics/id6743445270))
  plus a web dashboard. No Android app found.
- **Price:** Free download; $0.99/month or $9.99/year, plus optional "Support
  Tier" purchases. No team price published; teams book a demo.
- **Ratings:** 5.0 from 8 ratings, all reviews from the April 2025 launch
  weeks. Last update v1.1.1 on 2025-04-15.
- **Input, monitors, exports, heart rate:** **Unverified.** Neither the site
  nor the listing says whether workouts arrive by photo, Bluetooth or typing.
  A "QuickLog" feature is mentioned in release notes. No export targets are
  named anywhere, including the
  [privacy policy](https://powertenmetrics.com/privacy_policy/).
- **Analytics:** Power-duration analysis, test-time predictions, baseline
  against current statistics, trend lines to "spot plateaus", and comparisons
  with crewmates and other teams.
- **Teams:** The core of the product. Accounts are Coxie, Rower or Coach
  ([registration](https://powertenmetrics.com/central/accounts/register/team)),
  and the pitch is that it "replaces spreadsheets".
- **Account and privacy:** Account required. The App Store label lists only
  usage data, but the privacy policy covers name, email, phone, age, gender,
  location, billing and device data, and sharing with unnamed "trusted
  third-party service providers".
- **Owns ErgBot:** It bought ErgBot in March 2024 (2.18).

### 2.18 ErgBot (dormant)

- **What:** "The Automatic Erg Logger": photograph the monitor and the result
  lands in a personal **Google Sheet**
  ([App Store](https://apps.apple.com/us/app/ergbot/id1435719133);
  [JRN, 2022](https://jrn.news/ergbot)). Built by former Penn rowers from 2018.
  "Over 7,100 unique users" in 60+ countries by May 2022.
- **Status:** "As of March 2024, ErgBot has been acquired by Power Ten
  Metrics" ([ergbot.app, archived 2024-04-17](https://web.archive.org/web/20240417200556/https://www.ergbot.app/)).
  The iOS app is still listed under Power Ten Metrics LLC but its last update
  was v2.0 on 2021-11-30. The Android app (`com.ergbot777`) returns 404 on
  Google Play, and ergbot.com is parked for sale.
- **Price:** Free for individuals. Team Mode for clubs and schools was paid; no
  price published.
- **Ratings:** 4.8 from 59 ratings (US); 4.0 from 5 ratings
  ([UK](https://apps.apple.com/gb/app/ergbot/id1435719133)).
- **Input:** Camera photo, and from v1.2 a photo from the camera roll. v2.0
  added a confirm-data screen. Photos are read and stored on its server.
- **Data:** Overall time, metres, /500m and s/m plus **at most 8 splits**. No
  heart rate, watts or calories.
- **Exports:** The personal Google Sheet; Team Mode adds a filterable web log
  with CSV download and a link to the **original photo** for each row. No
  Strava, Garmin, Logbook or FIT.
- **Account and privacy:** Google sign-in required; sign-up asks for city and
  age. The App Store label lists fitness data linked to the user.
- **Complaints**
  ([reviews](https://apps.apple.com/us/app/ergbot/id1435719133?see-all=reviews)):
  forced Google sign-in and too much personal data, the app not opening, and
  (before v1.2) no way to use existing photos. These quotes came through a
  page-summarising fetch, so check them against the store before reusing them.

## 3. Feature comparison matrix

Moved to the top: see [Comparison at a glance](#comparison-at-a-glance).

## 4. Recurring user pain points

### 4.1 Bluetooth apps lose the workout (strongest signal)

From ErgData's Play reviews
([listing](https://play.google.com/store/apps/details?id=com.concept2.ergdata)):

- "The one and only purpose of this app is to connect to a machine … and save
  the data to the logbook … it consistently fails to do that." (1★, 2026-04-13)
- "There is like a 10% chance the app will actually save my rows." (1★,
  2025-11-27)
- "If the monitor powers down or disconnects for any reason, the whole workout
  session including detailed info is lost, requiring manual logbook entry …
  you should at least be able to access a specific session on memory to resync
  the splits instead of manual entry." (3★, 2026-04-30)
- "app disconnects from the machine doesn't record the workout so basically 40
  minutes of rowing just lost" (1★, 2026-01-28)
- "constant gliches, drops workouts wont sync" (1★, 2026-11-14)
- App Store, the same theme on iOS: "lost about 20% of my workouts"
  (04/07/2025, [App Store](https://apps.apple.com/us/app/ergdata/id561716382)).

ErgZone has the same complaint: "at least every other time I lose Bluetooth
connection and lose the workout" (2★, 2026-02-25,
[Play](https://play.google.com/store/apps/details?id=zone.erg)).

**What this means for us:** The PM5 keeps the splits in memory even when the
app drops them ([c2forum](https://c2forum.com/viewtopic.php?p=576446)).
Photographing the memory screen is exactly the "resync the splits from
memory" that the 2026-04-30 reviewer asks for.

### 4.2 Forced accounts, logins and personal data

- "to set up an account, I was forced to scroll back decades to input my DOB,
  which frankly I didn't want to give anyway. So I had to sack the whole thing
  off." (1★, 2026-10-01, ErgData Play)
- "I just want to use the app. I don't to make an account just to access it"
  (1★, 2026-02-03, ErgData Play)
- "GDPR is ignored. Impossible to delete you account and data" (1★,
  2026-01-09, ErgData Play)
- "can't log in" (1★, 2026-11-15) and "502 bad gateway error....cannot log in
  or save workouts" (1★, 2025-08-05) (ErgData Play)
- RowIQ added a mandatory account in 1.28.2
  ([App Store](https://apps.apple.com/app/id6761737498)).
- "This app requires a sign in to Google and asks for too much info (age,
  location) than necessary to fulfill its purpose." (2021-11-08, ErgBot
  [App Store](https://apps.apple.com/us/app/ergbot/id1435719133?see-all=reviews);
  quote not checked against the page, see 2.18)

### 4.3 Battery drain and background running (ErgData, late 2025)

At least ten one- and two-star reviews between 2025-11-14 and 2025-12-19, for
example "62% of battery usage is due to ErgData" (3★, 2025-11-14). A web app
with no background Bluetooth cannot have this problem.

### 4.4 Paywalls and scan limits

- "you definitely need premium to get best use (scan limitation is a problem
  for anyone other than very casual rowers)" (5★, 2026-10-05, ErgScan
  (store) [Play](https://play.google.com/store/apps/details?id=com.ergscan))
- "premium required for hr monitor" (1★, 2026-03-18, ErgZone Play)
- "Did not detect my heart rate but wanted money" (1★, 2022, ErgZone Play)
- ErgZone's paid features are "expensive for the UX … for individual athletes"
  (5★, 2024-09-21, ErgZone Play)
- ErgManiac: 1 free scan ever ([pricing](https://ergmaniac.com/pricing)).

### 4.5 Interval data mangled on the way to the log

- ErgScan (store) uploads intervals to the Logbook "as a fixed distance … the
  meters for each interval are displayed as a cumulative total" (4★,
  2026-01-10, [Play](https://play.google.com/store/apps/details?id=com.ergscan)).
- intervals.icu imports from the Logbook truncated a 4×8 min session to 26
  minutes and dropped rest power and cadence
  ([forum](https://forum.intervals.icu/t/concept2-integration-now-available/113001)).
  Another thread says ErgData sessions arrive "with most of the erg-specific
  data stripped"
  ([forum](https://forum.intervals.icu/t/concept2-ergdata-imports-missing-power-intervals-stroke-data/130984)).
- The manual Logbook form only takes time and distance for intervals
  ([c2forum, 2023](https://c2forum.com/viewtopic.php?p=563141)).
- "around 10% of my workouts don't sync with Garmin and the .fit and .tcx
  files are unavailable for download in Log Book" (2★, 2025-01-16, ErgData
  Play).

### 4.6 Weak history and analysis in the official tools

- "I want to see all my 2k distances. Why can't I filter om that?" (2★,
  2026-08-21, ErgData Play)
- "the ability to pick a distance that you've rowed before and see every
  effort at that distance, back to the beginning of time. That should be
  trivial" (3★, 2026-03-30, ErgData Play)
- "Would love to have it all in a CSV download." (5★, 2026-07-22, ErgZone
  Play)

### 4.7 Fitness ecosystem sync gaps

- Health Connect and Samsung Health: "doesn't integrate into Health Connect"
  (3★, 2025-11-24), "I use samsung health for everything and I could not see
  an option to connect" (2★, 2025-07-16) (ErgData Play).
- Garmin: "I wish it would connect to my Garmin app. I have go indirectly via
  Strava" (5★, 2026-05-31). Another review says ErgData's direct link
  "feeds into training status and the training load" (4★, 2025-05-16)
  (ErgZone Play). Concept2 itself says workouts sent from the Logbook are not
  counted in Training Status
  ([Concept2](https://www.concept2.com/node/13266)).
- "Need wifi, which I don't have in my garage." (2★, ErgZone Play)

### 4.8 Hardware coverage

- "doesnt work with planet fitness matrix brand rowers" (3★, ErgScan (store)
  Play)
- "No support for PM4 via USB" (1★, ErgZone Play). ErgData dropped the PM4 USB
  cable, "forcing us to buy a new PM5" (1★, 2025-04-30, ErgData Play).

## 5. Recommendations

Ranked by impact against effort. Each one keeps ErgScan's identity: offline
first, no account, private, open source.

### High impact

**R1. Direct upload to intervals.icu with the user's personal API key.**
High impact, low effort.

- **How:** The user pastes their athlete ID and API key once, stored only in
  the browser. "Upload" POSTs the FIT file we already build to
  `/api/v1/athlete/{id}/activities`
  ([open API](https://www.intervals.icu/features/open-api/);
  [Swagger](https://intervals.icu/api/v1/docs/swagger-ui/index.html)). We
  verified that the API answers CORS preflights with the `authorization`
  header allowed (2.13), so this needs no backend, no OAuth and no ErgScan
  account.
- **Evidence:** Rowsandall is shutting down and rowing analysis is moving to
  intervals.icu (2.13). ErgZone and CrewNerd just added intervals.icu
  integrations. The Logbook-to-intervals.icu path mangles intervals (4.5).
  No photo scanner offers this.

**R2. Concept2 Logbook upload through the Logbook API.**
High impact, medium effort.

- **How:** Map the review table to `POST /api/users/me/results`:
  - `workout_type`: FixedDistanceSplits, FixedTimeSplits,
    FixedDistanceInterval, FixedTimeInterval or VariableInterval
  - `workout.intervals[]` with `rest_time`, or `workout.splits[]`
  - `heart_rate`, `drag_factor`, `stroke_rate`, `comments`
  - `date` set to the **end** of the workout
  - `weight_class`, which is required for the rower

  Treat a 409 as "already in your log"
  ([API docs](https://log.concept2.com/developers/documentation/)).
- **Constraint:** The token exchange needs the `client_secret`, so the secret
  cannot ship in a public PWA. Run the OAuth code exchange and refresh on the
  existing **optional self-hosted server**, which only relays tokens and
  stores no workouts. Leave the feature off on static deployments.
- **Approval:** Register on log-dev, then ask Concept2 for live write access
  (ranking@concept2.com).
- **Payoff:** A single upload reaches Strava, Garmin Connect and TrainingPeaks
  through the Logbook's own connections
  ([Concept2 blog](https://concept2.com/blog/connecting-to-strava-garmin-connect-training-peaksand-more)),
  plus intervals.icu, rankings and challenges.
- **Evidence:** The Logbook is the hub (section 1). Rival scanners charge for
  Logbook sync. The interval-mangling complaint about the store app (4.5) is
  the bar to beat: get intervals right.

**R3. Position ErgScan as the free, no-account rescue for lost workouts.**
High impact, low effort.

- **How:** Rewrite the README, the landing page and the in-app intro around
  three messages:
  - "ErgData dropped your row? Photograph the PM5 memory screen."
  - "Unlimited scans, free forever, no account, nothing leaves your phone."
  - "The only scanner that gives you a FIT file with every split."
  - "Photo scanning that works in Europe": Erg Analyzer hides its photo entry
    there (2.16).
- **Also:** Add an FAQ entry on recovering a workout from PM5 memory after a
  Bluetooth drop. Write honest comparison pages like Watta's
  ([getwatta.com/vs](https://getwatta.com/vs/best-rowing-app)).
- **Evidence:** 4.1 to 4.4: lost workouts, forced accounts, battery drain and
  paywalls are the top complaints across ErgData, ErgZone and the store
  scanners.

**R4. Get found: name and distribution.** High impact, medium effort.

- **Name:** ErgScan shares its name with a store app (1K+ Play downloads,
  premium, cloud). The README disclaimer helps, but searches will land on the
  wrong app.
- **Options:**
  - A distinguishing tagline in the title, e.g. "ErgScan, free and open
    source".
  - Publishing the PWA on Google Play as a Trusted Web Activity, which keeps
    one codebase.
  - Asking to be listed on [Concept2's apps page](https://www.concept2.com/apps).
    It lists no photo scanner today, though Concept2 may decline.
- **Evidence:** Every competitor is found through a store. Watta ranks for
  "best rowing app" and names "ErgScan" as a photo app that "stops at the log"
  ([getwatta.com/vs](https://getwatta.com/vs/best-rowing-app)), which most
  likely refers to the store app.

### Medium impact

**R5. Personal bests and "every effort at this distance".**
Medium impact, low effort.

- **How:** History filters by distance or time (500m, 1k, 2k, 5k, 6k, 10k,
  HM, 30 min, 60 min), a PB badge on save, and a simple pace trend chart, all
  computed locally from history we already store.
- **Also:** Recognise standard tests and protocols by their structure (2k,
  5k, 6k, 30r20, 4×4), rank repeats of the same workout, and show a 2k
  prediction with its caveats.
- **Evidence:** ErgData reviews ask for this word for word (4.6). Watta,
  ErgManiac and the store app all offer PBs or comparisons, the store app as
  a Premium feature. Erg Analyzer ranks repeated workouts and projects 2k
  times (2.16); Power Ten Metrics sells test predictions and plateau trends
  (2.17).

**R6. CSV and JSON export of history, and import of a backup.**
Medium impact, low effort.

- **How:** Per-workout and whole-history CSV with one row per split, plus a
  JSON backup that can be restored. This gives data portability without
  sync.
- **Evidence:** "Would love to have it all in a CSV download" (ErgZone).
  ErgPal's export to Sheets, Excel and CSV is its main selling point at
  $8.99/month. ErgManiac puts "data export" behind Pro. ErgBot's whole value
  was rows landing in a Google Sheet (2.18).

**R7. SkiErg and BikeErg support.** Medium impact, medium effort.

- **How:** The PM5 results table has the same layout. Add machine selection,
  the BikeErg's /1000m pace (the parser already reads /1000m), and FIT sport
  and sub-sport per machine.
- **Evidence:** Watta covers all three machines. ErgData and ErgZone users
  row, ski and bike (ErgData BikeErg complaints in 4.1). intervals.icu now has
  a "Virtual Ski" type for SkiErg
  ([forum](https://forum.intervals.icu/t/concept2-integration-now-available/113001)).

**R8. PM3 results screens.** Medium impact, medium effort.

- **How:** Collect sample photos and add PM3 layout parsing.
- **Evidence:** Watta and ErgManiac read the PM3. ErgData and RowIQ do not
  support the PM3 or PM4 at all, so owners of older monitors have no
  Bluetooth option and are a natural audience for a scanner.

**R9. Make getting the file into Strava and Garmin less manual.**
Medium impact, low effort.

- **How:** Keep the Web Share flow and add a short per-platform "send to"
  guide: the Strava web uploader
  ([Strava](https://support.strava.com/hc/en-us/articles/223297187-How-to-get-your-Activities-to-Strava)),
  Garmin Connect's import, and on iOS a file-upload helper or the
  intervals.icu route (R1).
- **Why not direct:** Direct Strava upload needs a client secret on a server
  ([Strava auth](https://developers.strava.com/docs/authentication/)), so
  treat it like R2, as a self-hosted-only extra, and only if users ask.
- **Evidence:** Every rival with traction pushes to Strava automatically.

**R10. Accuracy and trust in the OCR.** Medium impact, medium effort.

- **How:**
  - Keep publishing OCR evaluation numbers.
  - Highlight low-confidence cells in the review table.
  - Optionally let advanced users plug in their **own** vision-model endpoint
    or key. This must be off by default and clearly labelled as sending the
    photo off the device.
- **Evidence:** The cloud rivals sell "AI accuracy"
  (static analysis; App Store copy). Users punish failed
  scans: "Doesn't function well at all … does nothing" (Ergbase), "Doesnt
  work" (store app, 1★).

### Low impact, or later

**R11. Shareable summary image.** Low to medium impact, low effort.

- **How:** Draw the split table, PB badge and zone bar on a canvas locally and
  share it through Web Share. No server needed.
- **Evidence:** ErgTracker's whole Strava story is an image. The store app
  added "Instagram-ready workout cards" in 1.20. Concept2's Strava image only
  appears for public workouts (2.7).

**R12. Effort score and split consistency.** Low impact, low effort.

- **How:** Port ErgManiac's split-consistency label and add an optional
  effort or zone-by-pace estimate
  (static analysis).
- **Evidence:** Watta's headline metric is an Effort Score.

**R13. Other rowers and gym machines.** Low impact, high effort.

- **What:** Matrix rowers, then treadmills.
- **Evidence:** A Planet Fitness Matrix complaint (4.8), and the existence of
  TreadLog and GymReader. This is outside the Concept2 niche, so leave it
  until R1 to R8 are done.

**R14. Heart-rate analysis: cardiac decoupling and recovery between
intervals.** Low to medium impact, low effort.

- **How:** Compute Pw:HR decoupling and heart-rate recovery in rest intervals
  from the per-split heart rate and the watch's second-by-second heart rate we
  already have. Show them next to the training-band time, with a short note on
  how each is computed. When there is no heart rate, say what adding a watch
  file would unlock.
- **Evidence:** Decoupling and HR recovery are headline metrics in Erg
  Analyzer, which explains each metric and the tier of analysis the data
  supports (2.16).

**R15. "Copy for your AI coach" export.** Low impact, low effort.

- **How:** One tap copies or shares the workout, or recent history, as
  Markdown or JSON with a short coaching prompt, ready to paste into any
  chatbot. Nothing is hosted; it sits alongside the MCP server.
- **Evidence:** Erg Analyzer's JSON export carries a full coach prompt and
  training-plan library (2.16), a cheap way to offer "AI coaching" without
  running one.

**R16. Keep the source photo with the workout.** Low impact, low effort.

- **How:** Store a downscaled copy of the scanned photo with the workout,
  locally and in encrypted sync, and show it on the workout page so values can
  be checked later.
- **Evidence:** ErgBot's Team Mode linked the original photo to every log row
  for checking (2.18).

**Not recommended:** AI coach, clubs, leaderboards and training plans. These
need accounts and servers, are where the paid rivals compete, and go against
ErgScan's identity. The MCP server (see [MCP](../mcp.md)) and R15 already let
users bring their own AI coach without us hosting anything. Coaches are the
core market for Power Ten Metrics and were ErgBot's paid tier (2.17, 2.18). If
that demand shows up, a read-only, end-to-end-encrypted share link built on
private sync fits ErgScan better than team accounts.

## 6. Sources

**Store listings and vendor sites**

- ErgScan (store app), App Store: https://apps.apple.com/us/app/ergscan-rowing-workouts-log/id1661654775
- ErgScan (store app), Google Play: https://play.google.com/store/apps/details?id=com.ergscan
- ErgManiac: https://ergmaniac.com/ · https://ergmaniac.com/pricing · https://ergmaniac.com/blog/how-to-log-concept2-workouts-photo-scan · https://play.google.com/store/apps/details?id=com.ergmaniac.app
- Watta: https://getwatta.com/ · https://getwatta.com/download · https://getwatta.com/vs/best-rowing-app · https://getwatta.com/guides/rowing-apps-that-work-with-pm5 · https://apps.apple.com/us/app/watta/id6758580968 · https://play.google.com/store/apps/details?id=com.utx.app
- ErgTracker: https://apps.apple.com/us/app/ergtracker-scan-share/id6758005288 · https://play.google.com/store/apps/details?id=com.niewerdsorganization.ergtracker
- ErgPal: https://apps.apple.com/us/app/rowing-tracker-ergpal/id6770650039 · https://apps.apple.com/il/developer/robert-alan-neithart/id1896759891
- Ergbase Rowing: https://apps.apple.com/us/app/ergbase-rowing/id6446604086
- ErgData: https://apps.apple.com/us/app/ergdata/id561716382 · https://play.google.com/store/apps/details?id=com.concept2.ergdata
- ErgZone: https://apps.apple.com/us/app/ergzone/id1474566270 · https://play.google.com/store/apps/details?id=zone.erg
- RowIQ: https://apps.apple.com/app/id6761737498
- PainSled: https://apps.apple.com/gb/app/painsled/id1069679171 · https://chromewebstore.google.com/detail/painsled-indoor-rowing-da/ghbmenofmepjomdkhinghoglaifnlgmp?hl=en
- EXR: https://www.exrgame.com/
- RowPro: https://digitalrowing.com/products
- StraUpload: https://apps.apple.com/us/app/straupload/id1297360974
- TreadLog: https://apps.apple.com/app/id6780434604 · GymReader: https://apps.apple.com/us/app/id6761631557
- Erg Analyzer: https://erg.form-signal.com/ · https://erg.form-signal.com/assets/index-C9NDZ08G.js (public bundle, v6.2.0, read 2026-11-24) · https://www.form-signal.com/about.html · https://www.form-signal.com/products
- Power Ten Metrics: https://apps.apple.com/us/app/power-ten-metrics/id6743445270 · https://powertenmetrics.com · https://powertenmetrics.com/central/accounts/register/team · https://powertenmetrics.com/privacy_policy/ · https://jrn.news/jrn-and-power-ten-metrics-announce-partnership/
- ErgBot: https://apps.apple.com/us/app/ergbot/id1435719133 · https://apps.apple.com/gb/app/ergbot/id1435719133 · https://apps.apple.com/us/app/ergbot/id1435719133?see-all=reviews · https://jrn.news/ergbot · https://web.archive.org/web/20240417200556/https://www.ergbot.app/ · https://play.google.com/store/apps/details?id=com.ergbot777 (404)
- Not read (403): Business Wire on the ErgBot acquisition, https://www.businesswire.com/news/home/20240714422349/en/

**Concept2**

- Compatible apps: https://www.concept2.com/apps
- Connecting to Strava, Garmin and TrainingPeaks: https://concept2.com/blog/connecting-to-strava-garmin-connect-training-peaksand-more
- Garmin devices and the PM5: https://www.concept2.com/node/13266
- Uploading to the Logbook: https://concept2.co.uk/service/software/concept2-utility/how-to-use/uploading-results-to-online-logbook
- Results to a spreadsheet (CSV): https://concept2.co.uk/service/software/concept2-utility/how-to-use/transferring-results-to-spreadsheet
- Logbook API: https://log.concept2.com/developers/documentation/ · https://log.concept2.com/developers/home

**Forums**

- c2forum: https://c2forum.com/viewtopic.php?p=576446 · https://c2forum.com/viewtopic.php?p=563141 · https://c2forum.com/viewtopic.php?p=429677
- Suunto forum: https://forum.suunto.com/post/187853

**intervals.icu**

- Concept2 integration: https://forum.intervals.icu/t/concept2-integration-now-available/113001
- ErgZone integration: https://forum.intervals.icu/t/ergzone-intervals-icu-integration-beta-row-ski-bike-run/121833
- Rowsandall migration: https://forum.intervals.icu/t/support-for-rowing-data-migrating-from-rowsandall-com/117915 (and ?page=2)
- ErgData imports: https://forum.intervals.icu/t/concept2-ergdata-imports-missing-power-intervals-stroke-data/130984
- API: https://www.intervals.icu/features/open-api/ · https://intervals.icu/api/v1/docs/swagger-ui/index.html

**Strava**

- https://support.strava.com/hc/en-us/articles/223297187-How-to-get-your-Activities-to-Strava
- https://developers.strava.com/docs/uploads/
- https://developers.strava.com/docs/authentication/

**Other**

- OpenRowingMonitor: https://github.com/JaapvanEkris/openrowingmonitor
- ABC Trainerize OCR idea: https://ideas.abcfitness.com/forums/940789-client-gym-members-abc-trainerize/suggestions/34690408-use-optical-character-recognition-to-record-stats
- Static analysis of the ErgManiac, ErgTracker and ErgScan (store app) Android apps (notes not in the repository)
- CORS checks: `OPTIONS` preflights from an arbitrary origin to `https://intervals.icu/api/v1/athlete/0/activities` and `https://log.concept2.com/api/users/me/results`, run 2026-11-24.
