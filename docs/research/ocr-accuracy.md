# Improving OCR accuracy in the browser

[← Back to README](../../README.md)

Researched 2026-11-25. This document answers one question: what would make
ErgScan read a photo of the results screen more accurately, while everything
still runs in the browser? It rests on two kinds of evidence:

- **Measurements** on the 75 labelled photos in `testdata/`, scored with the
  repository's own parser and `testdata/score.ts`. They ran in Node on a
  desktop. Section 7 says how.
- **Primary sources**: project repositories, documentation, model cards,
  papers and the code inside published packages. Anything not confirmed from
  one is marked **unverified**.

Nothing here was run in a phone browser. Speed and memory on phones are the
largest open questions (section 6).

The tables use four scores:

| Score | Meaning |
| --- | --- |
| Cells | Table cells on the screen (such as `1:53.4`) that appear exactly in the OCR text |
| Rows | Table rows that appear exactly, cell for cell |
| Fields | Workout fields that are right after parsing: the summary's time, meters and rate, the date, and each lap's time, meters, rate and heart rate. The parser repairs some OCR errors, so this is higher than cells |
| Whole workout | Photos where every field is right, so the user has nothing to fix |

## Summary

| Read by | Cells | Rows | Fields | Whole workout |
| --- | --- | --- | --- | --- |
| Today: Tesseract, stock English model | 69% | 31% | 83% | 12 of 75 |
| Tesseract, given the labelled screen position | 69% | 28% | 80% | 12 of 75 |
| PP-OCRv6 tiny, whole photo at 2000 px | 90% | 69% | 90% | 35 of 75 |
| PP-OCRv6 tiny, whole photo shrunk to 1000 px | 92% | 72% | 94% | 38 of 75 |
| PP-OCRv6 tiny, labelled screen resized to 800 px wide | 92% | 71% | 95% | 41 of 75 |

1. **The recognition engine is the main limit.** PP-OCRv6 tiny is an
   Apache-2.0 text detector and recogniser from PaddleOCR, 6.2 MB as ONNX
   files, released in June 2026 with dot-matrix displays as a stated target.
   With no screen detection, a simple row grouper and ErgScan's parser
   unchanged, it reads 90 to 92% of cells where Tesseract reads 69%, and
   gets the whole workout right on three times as many photos (2.6).
2. **A better crop does not help Tesseract.** Given the labelled screen
   position, Tesseract scores the same as with today's screen detection
   (2.2). A model that only finds the screen's box would buy nothing.
3. **Tilt does hurt Tesseract.** On 12 photos it reads perfectly, rotating
   the photo 2° leaves 2 perfect, and 5° leaves none. Warping the photos
   back restores nearly all of them, so straightening the photo before the
   crop would fix this. tesseract.js has a cheap partial version, a
   `rotateAuto` option that rotates the image by the slope of its text. With
   it, 11 of the 12 stay perfect at 2° and 6 at 5°, but it does nothing at
   10° and makes side-on photos worse (2.3).
4. **PP-OCRv6 does not need the photo aligned.** It finds each piece of text
   as a four-cornered box and straightens it before reading. Its scores do
   not move between 0° and 10° of rotation (2.6).
5. **Training a small model to align the image is possible, but it is not
   where the accuracy is.** Corner-finding networks of 0.4 to 1.2 million
   parameters exist and do far better than classical edge detection on hard
   backgrounds (3.3, 3.4). ErgScan has no four-corner labels yet, and
   findings 2 to 4 leave little for such a model to fix. What does matter is
   scale. Shrinking the whole photo from 2000 to 1000 px lifts PP-OCRv6 from
   90% to 94% of fields and removes a total failure on close-ups. The
   labelled screen at 800 px wide gives 95% (2.6).
6. **OpenCV.js is neither needed nor usable as shipped.** A four-point
   perspective warp is about 60 lines of TypeScript. Stock OpenCV.js builds
   are 3.5 to 4.5 MB gzipped and contain `new Function`, which ErgScan's
   Content-Security-Policy forbids (3.5).
7. **Most of what PP-OCRv6 still gets wrong is punctuation.** Its commonest
   error by far, 43% of its wrong cells, is a colon read as `1` (`2:05.2`
   becomes `2105.2`). On the resized screen, 96% of rows have every digit
   right once punctuation and spacing are forgiven, against 71% exactly
   right. The parser knows each column's format and the arithmetic between
   columns, so it can repair most of that (2.6, 4.5).

The costs: the OCR download grows from about 4.0 MB to about 9.5 MB if
PP-OCRv6 replaces Tesseract, it runs single-threaded unless the site adds
cross-origin isolation headers, and nobody has measured it on a phone yet.

Recommended order (details in section 5):

1. Add a `rotateAuto` read to Tesseract's retry. Hours of work, a small
   gain, and only worth it while Tesseract is the engine.
2. Prototype PP-OCRv6 tiny on onnxruntime-web behind the existing
   `Recognizer` interface, and measure it on real phones.
3. Shrink the photo, or better the screen, to a fixed size before
   recognition.
4. Teach the parser the new engine's mistakes.
5. Train a recogniser on the monitor's own font. This is the route to the
   last few percent, and the first step that needs a training pipeline.
6. Leave a corner-finding model until photos from real use show that
   side-on shots are still a problem.

## 1. How a photo is read today

`src/ocr/` does this, in order:

1. Scale the photo to 3000 px on its long side and convert it to grey.
2. `findScreen` shrinks it to 320 px, thresholds it and takes the largest
   bright, screen-shaped region, with special cases for the silver PM4. The
   result is an upright rectangle. Nothing corrects rotation or perspective.
3. Scale the crop to 1300 px wide, blur it (the blur joins the LCD's dots
   into strokes) and threshold it.
4. Tesseract (tesseract.js 7, LSTM engine, stock `eng` model, one block of
   text) reads the thresholded image, then the blurred grey one if the first
   did not parse.
5. `parsePm5Text` turns the text into a workout and repairs what it can.
6. If the splits do not add up to the total, a second pass finds the table by
   its heading row and reads that crop too. The read with more fields that
   check out wins.

Any change has to respect what the app promises and how it is served:

- Photos never leave the device, so cloud OCR is out.
- The Content-Security-Policy in `nginx-headers.conf` is `script-src 'self'
  'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'`. No `eval` or
  `new Function`, no workers from blob URLs, no fetches to other origins.
- The site sends no COOP/COEP headers, so WebAssembly threads are off.
- OCR files are cached by the service worker for offline use. Today they are
  about 4.0 MB: 1.06 MB of Tesseract WebAssembly (gzipped) and a 2.95 MB
  model.

## 2. What the measurements show

### 2.1 Baseline

`npm run eval` on all 75 photos: 69% of cells (1541 of 2242), 31% of rows,
83% of fields, the right number of laps on 65 photos, and the whole workout
right on 12. Seven photos get fewer than half their fields.

| Monitor | Photos | Cells | Fields |
| --- | --- | --- | --- |
| PM3 | 6 | 57% | 63% |
| PM4 | 6 | 59% | 82% |
| PM5 | 62 | 70% | 84% |

### 2.2 The crop is not the bottleneck

Compared with the labelled screen rectangle, `findScreen` finds nothing on 6
photos, cuts off part of the screen on 10, picks a different region on 1,
and returns a box more than twice too large on 1. On those 18 photos fields
drop to 63%, against 88% on the other 57.

That looks like a localisation problem. It is not. `npm run eval -- --framed`
replaces screen detection with the labelled rectangle, and the totals do not
improve: 69% of cells and 80% of fields. On the 18 photos with a bad crop,
the labelled rectangle lifts fields from 63% to only 71%. These are the hard
photos (PM3, PM4, glare, uneven light), and Tesseract misreads them even
when it is handed the screen. (`--framed` also skips the heading-row retry,
which is why it scores slightly lower on the photos that were already
cropped well.)

So a better box around the screen, however it is found, would not raise
accuracy with the current engine.

### 2.3 Tilt is

The 12 photos that today's pipeline reads perfectly were rotated in the
image plane, and separately turned about their vertical axis as if
photographed from the side, then read by the unchanged pipeline.

| Change to the photo | Cells | Fields | Whole workout |
| --- | --- | --- | --- |
| None | 84% | 100% | 12 of 12 |
| Rotated 2° | 76% | 94% | 2 of 12 |
| Rotated 5° | 54% | 53% | 0 of 12 |
| Rotated 10° | 38% | 28% | 0 of 12 |
| From the side, 15° | 75% | 98% | 6 of 12 |
| From the side, 30° | 61% | 86% | 0 of 12 |

A 2° tilt is enough to break most reads. Tesseract's documentation warns of
this without giving a number: "The quality of Tesseract's line segmentation
reduces significantly if a page is too skewed"
([tessdoc](https://github.com/tesseract-ocr/tessdoc/blob/main/ImproveQuality.md)).
A test in Tesseract's tracker shows the same cliff on a printed page: 7
errors at 0° and at about 1°, 626 at 2°, 3530 at 3°
([issue 4116](https://github.com/tesseract-ocr/tesseract/issues/4116)).

tesseract.js can correct part of it. `worker.recognize(image, { rotateAuto: true })`
runs Tesseract's line finder, reads the slope of the text lines and rotates
the image before recognising it
([source](https://github.com/naptha/tesseract.js/blob/master/src/worker-script/index.js)).
The same 12 photos with that one option:

| Change to the photo | Cells | Fields | Whole workout |
| --- | --- | --- | --- |
| None | 83% | 100% | 11 of 12 |
| Rotated 2° | 80% | 99% | 11 of 12 |
| Rotated 5° | 75% | 95% | 6 of 12 |
| Rotated 10° | 38% | 28% | 0 of 12 |
| From the side, 15° | 70% | 88% | 3 of 12 |
| From the side, 30° | 62% | 80% | 0 of 12 |

So `rotateAuto` recovers small rotations, does nothing at 10°, and makes
side-on photos worse (3 perfect where there were 6). In a side-on photo the
text lines slope by different amounts, and one rotation cannot fit them.
It also runs after the crop and the threshold, which a rotated screen has
already damaged.

As a check that the loss comes from the tilt and can be undone, each warped
photo was warped back with the exact inverse and read again. That restores
11 of 12 at 5° of rotation, 9 of 12 at 10° and 10 of 12 at 30° from the
side. A step that straightens the photo before the crop would recover
nearly all of it, if it knew the angle or the corners.

The test photos themselves are mostly straight, because they were taken the
way the README asks. Measured from the slope of the text, the median tilt is
0.4°, 19 of 75 are tilted 1° or more, 5 are 2° or more and one is nearly 6°.
Photos from real use are likely to be less careful, so the eval understates
this problem.

On all 75 photos `rotateAuto` is a mixed bag. Alone it gives 81% of fields
and 19 whole workouts, against 83% and 12: better on 24 photos and worse on
11, a few of them badly. On the 19 photos tilted 1° or more it lifts fields
from 76% to 80%. On the straighter 56 it lowers them from 85% to 82%. Used
as a second read, with the trust score choosing between the plain read and
the rotated one, it gives 84% of fields and 18 whole workouts.

### 2.4 What Tesseract gets wrong

A typical read, from a PM4 photo:

```
J  2:18.0  S00 2:18.0 19 133
sy 2:139 1000 2:13.9 19 149]
B 2:13.4 2000 2:13.4 19 159] 3
```

Three patterns repeat across the set:

- The frame around the table and the scroll arrows are read as characters at
  the start and end of rows.
- Decimal points and colons are dropped or become digits (`2:139`,
  `2113.4`). On this display a point is a single LCD dot.
- Whole rows go missing, and digits are swapped for letters (`S00`).

The stock English model was trained on printed fonts, about 400,000 lines in
4,500 of them
([tessdoc](https://github.com/tesseract-ocr/tessdoc/blob/main/tess5/TrainingTesseract-5.md)).
A dot-matrix font whose digits are about five dots wide and seven tall is
far from that.

### 2.5 Tesseract settings tried

Each row is the unchanged app pipeline with one setting changed, on all 75
photos.

| Setting | Cells | Fields | Whole workout | Why try it, and what happened |
| --- | --- | --- | --- | --- |
| Today | 69% | 83% | 12 | |
| Noise filters off (`textord_noise_rejrows` and `textord_noise_rejwords` set to 0) | 69% | 83% | 12 | Tesseract's source rejects rows made mostly of dot-sized blobs, which could explain missing rows. It does not: no change |
| Each line read again on its own in raw-line mode (PSM 13), using the line boxes of the block read | 56% | 65% | 0 | Tesseract's network is a line recogniser, so single lines should suit it. Much worse as tried: the padded line boxes take in the table's frame, and raw-line mode skips the clean-up that removes it |
| `rotateAuto` on every read | 69% | 82% | 19 | 2.3. More whole workouts, fewer fields in total |
| A plain read and a `rotateAuto` read, the trust score choosing | n/a | 84% | 18 | Estimated from the outputs of the two runs above |
| The screen crop scaled to 900 px wide instead of 1300 | 61% | 78% | 10 | PP-OCRv6 read better from a smaller image (2.6), so a smaller crop might help Tesseract too. It does not: worse on every count |

None of these raises the totals by more than a point or two. The settings
are not what holds Tesseract back on this display.

### 2.6 A different engine: PP-OCRv6 tiny

PP-OCRv6 came out with PaddleOCR 3.7.0 on 2026-06-11. The release note
lists "Major improvements in digital displays, dot-matrix characters, tire
prints, and industrial text recognition" and three sizes, of which tiny is
the smallest
([release](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.7.0)).
It is two networks. A detector marks each piece of text with a four-cornered
box. A recogniser reads each box after it has been warped upright to 48 px
high.

| File | Size | Parameters | Licence |
| --- | --- | --- | --- |
| [PP-OCRv6_tiny_det](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx) `inference.onnx` | 1,780,590 bytes | 0.43 M | Apache-2.0 |
| [PP-OCRv6_tiny_rec](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx) `inference.onnx` | 4,462,639 bytes | 1.1 M | Apache-2.0 |

The measurements ran these models through ONNX Runtime in Python, grouped the
boxes into rows by their vertical position, and fed the text to
`parsePm5Text` unchanged.

| Input | Cells | Rows | Fields | Whole workout | Lap count right |
| --- | --- | --- | --- | --- | --- |
| Tesseract today, for comparison | 69% | 31% | 83% | 12 | 65 |
| Whole photo, 2000 px long side | 90% | 69% | 90% | 35 | 71 |
| Whole photo, 1000 px long side | 92% | 72% | 94% | 38 | 74 |
| The same in grey (as the `Recognizer` interface would pass it) | 93% | 76% | 93% | 30 | 72 |
| Labelled screen rectangle, at the photo's resolution | 91% | 72% | 91% | 38 | 71 |
| Labelled screen rectangle, resized to 800 px wide | 92% | 71% | 95% | 41 | 74 |

By monitor, on the resized screen: PM3 95% of cells and 98% of fields, PM4
90% and 92%, PM5 92% and 95%. The gap between monitors that Tesseract shows
(2.1) is gone.

**Scale matters.** One close-up photo where the screen fills the frame came
back as noise from the 2000 px run: at that size the model sees separate
LCD dots, not strokes. Tesseract reads that photo perfectly, because step 3
of today's pipeline blurs the dots together. Shrinking the whole photo to
1000 px fixed it and raised fields from 90% to 94%, with no screen detection
at all. Cropping to the labelled screen and resizing it to 800 px wide gave
95%. So the job left for screen detection is small: not a tighter box, but a
known size, worth about one point of fields over simply shrinking the photo.

**Tilt does not matter.** On the same 12 photos as in 2.3, warped the same
way, then cropped to the labelled screen and resized to 800 px wide:

| Change to the photo | Cells | Fields | Whole workout |
| --- | --- | --- | --- |
| None | 94% | 99% | 9 of 12 |
| Rotated 2° | 94% | 96% | 7 of 12 |
| Rotated 5° | 96% | 99% | 9 of 12 |
| Rotated 10° | 95% | 99% | 9 of 12 |
| From the side, 15° | 95% | 98% | 8 of 12 |
| From the side, 30° | 95% | 99% | 8 of 12 |

(These 12 were chosen because Tesseract reads them perfectly, so the first
row flatters Tesseract. The movement down the table is the point.)

**What it still gets wrong.** On the resized screen, 168 of 2242 cells are
wrong:

| Share | Kind of error | Example of the kind |
| --- | --- | --- |
| 49% | One character substituted. 73 of these 82 are a colon read as `1`; about 10 are a wrong digit | `2:05.2` read as `2105.2` |
| 18% | Digits right, split or joined differently | `4:48 .5` |
| 17% | Digits right, colon or point missing or wrong | `125.8` for `1:25.8` |
| 9% | Right characters, joined to the next cell | `100002:06.4` |
| 7% | Several characters wrong | glare, a row cut off |

Wrong digits are rare. 71% of rows are exactly right, and 96% (504 of 524)
have every digit right and in order once a colon may appear as `1` or be
missing, a point may be missing, and spacing may differ. Each column has a
known format, and each row carries a check (pace equals time over distance),
so most of that gap is the parser's to close. The parser today repairs
Tesseract's habits, not these.

Tesseract's errors are of a different kind. Under the same forgiving rule
only 61% of its rows have every digit right. A quarter of its wrong cells
have several characters wrong, and no parser can repair those.

**It runs in the WebAssembly runtime.** onnxruntime-web 1.31.1, the build a
browser would load, was run in Node with one thread on the same inputs as
native ONNX Runtime. The detector's output matched to within 0.0004 and all
47 text boxes of a test photo decoded to the same text.

**Speed, roughly.** All on one slow desktop processor that was busy with
other work, so these compare the engines with each other and say little
about a phone:

| What | Time |
| --- | --- |
| Today's pipeline, per photo (median of the baseline run; Tesseract in WebAssembly, one thread) | 13 s |
| PP-OCRv6 tiny, whole photo at 1000 px, native, two threads (median) | 2.5 s |
| Detector alone on 640×640, WebAssembly, one thread | 0.9 s |
| The same, native, one thread | 0.6 s |
| Recogniser on 47 boxes padded to 320 px wide, WebAssembly, one thread | 6.7 s |
| The same, native, one thread | 4.6 s |
| Loading the runtime and the detector, once | 2.3 s |

WebAssembly ran at about two thirds of native single-thread speed. The 47
boxes are a worst case: the batch pads every box to the widest, and most
cells are a fraction of that. Read at their own widths, or as whole rows,
the recogniser has several times fewer pixels to process. A full read in
one WebAssembly thread was not timed.

### 2.7 Limits of these measurements

- 75 photos is a small set, with 6 each of PM3 and PM4.
- Today's pipeline was tuned on these photos (threshold, blur, the PM4
  special cases). PP-OCRv6 saw them for the first time. If anything this
  favours Tesseract.
- The PP-OCRv6 runs used the labelled screen rectangle where they cropped,
  and a row grouper written for the measurement. A real integration has to
  find the screen itself, and it can group rows better.
- Timings come from a slow, busy desktop, not a phone.
- The tilt tests warp existing photos. That reproduces the geometry of a
  tilted photo, not the change in glare or focus.

## 3. Options: aligning the image

### 3.1 Rotation

Three ways to measure the angle, cheapest first:

- **`rotateAuto` in tesseract.js.** No download, one option. It ignores
  angles under about 0.3°, corrects rotation only, and in 2.3 it helped up
  to 5° and made side-on photos worse.
- **A projection-profile deskew in TypeScript.** Rotate a small thresholded
  copy through a range of angles and keep the one where the row sums vary
  most. Leptonica, the image library inside Tesseract, does this over ±7°
  and says it "will work on a surprisingly small amount of text data (just a
  couple of text lines)"
  ([skew.c](https://github.com/DanBloomberg/leptonica/blob/master/src/skew.c)).
  This would let the app rotate before it crops and thresholds, which
  `rotateAuto` cannot.
- **The text boxes of a detector.** PP-OCRv6's boxes carry their own angle.
  The tilt figures in 2.3 were measured this way.

### 3.2 Perspective: the warp is easy, the corners are hard

Undoing perspective needs the screen's four corners and a homography. The
homography is an 8×8 linear solve and the warp is a loop with bilinear
sampling. Both were written for the tilt tests in about 60 lines of
TypeScript with no library. `perspective-transform` (MIT, 4 kB) is a
ready-made solver
([repository](https://github.com/jlouthan/perspective-transform)). Canvas 2D
cannot do it, because its transform matrix is affine by specification
([HTML Standard](https://html.spec.whatwg.org/multipage/canvas.html#transformations)).
WebGL can, but for one screen-sized image a loop over the pixels is enough.

The hard part is finding the corners.

### 3.3 Finding corners with classical image processing

The usual recipe is edge detection, contours and a four-sided polygon fit.
The best public evidence on how well that works is the SmartDoc 2015
competition, where teams located documents in phone video on five
backgrounds
([report](https://doi.org/10.1109/ICDAR.2015.7333943)). Scores are the
overlap between the found and the true quadrilateral:

| Method | Background 1 (easy) | Background 4 (light, low contrast) | Background 5 (cluttered, document partly hidden) |
| --- | --- | --- | --- |
| The three best entries: line segments or shape trees, plus the previous frames | 0.99 | 0.98 | 0.69 to 0.86 |
| The four entries built on Canny edges with Hough lines or contours | 0.83 to 0.97 | 0.36 to 0.83 | 0.01 to 0.22 |

The recipe a document-scanner tutorial teaches is the bottom row. A dark
LCD in a dark case, or a grey one in a silver case, is a low-contrast
boundary, and glare adds false edges. Dropbox's scanner team reported the
same for anything with text on it: edge detection lit up the text and
barely showed the outline, so they replaced it with a learned edge detector
([Dropbox](https://dropbox.tech/machine-learning/fast-and-accurate-document-detection-for-scanning)).

There is a second classical route that fits ErgScan better: use the text.
The firmware fixes where the heading words and rows sit, so matched word
boxes give more than the four point pairs a homography needs. It costs an
extra OCR pass, and the first pass has to survive the distortion it is
trying to measure. No source evaluates this for monitor screens.

### 3.4 Finding corners with a small trained model

Small networks that output a document's four corners exist and score far
above the classical recipes on the same SmartDoc data:

| Model | Parameters | Size | SmartDoc overlap | Licence |
| --- | --- | --- | --- | --- |
| [LDRNet](https://arxiv.org/abs/2206.02136), MobileNetV2 at 0.35 width, 224 px input | about 0.4 M (derived from the paper) | **unverified** | 0.98 | MIT |
| [DocAligner](https://github.com/DocsaidLab/DocAligner) LC050, heatmap | 0.4 M | 1.7 MB | 0.98 | Apache-2.0 |
| DocAligner LC100, heatmap | 1.2 M | 4.9 MB | 0.99 | Apache-2.0 |
| DocAligner point regression | 1.1 M | 4.5 MB | 0.96 | Apache-2.0 |

All were trained on paper and ID cards, so ErgScan would train its own. What
that takes:

- **Four-corner labels.** The 75 photos have a bounding rectangle each. A
  rectangle can train a box detector, which finding 2 says is not worth
  having. Clicking four corners on 75 photos is an hour's work.
- **Synthetic data.** 75 photos is below any published guidance. DeepLabCut
  reports good keypoint accuracy from about 200 labelled frames with
  transfer learning ([paper](https://arxiv.org/abs/1804.03142)). The standard
  remedy is to cut the labelled screens out and paste them onto other
  backgrounds under random homographies, changing tint, glare and blur
  ([Cut, Paste and Learn](https://arxiv.org/abs/1708.01642),
  [DocAligner's dataset notes](https://docsaid.org/en/docs/docaligner/dataset/)).
- **A runtime.** The same onnxruntime-web that PP-OCRv6 needs.
- **Corner precision.** DocAligner notes that corners found on a 256 px
  input land 5 to 10 px off when scaled back up
  ([model notes](https://docsaid.org/en/docs/docaligner/model_arch/)).

General object detectors with permissive licences (YOLOX, NanoDet,
PP-PicoDet, D-FINE, MediaPipe's object detector) output upright boxes only,
which is what `findScreen` already produces.

With PP-OCRv6 reading each text box upright on its own, a corner model has
one job left: giving the screen a known size and cutting away the rest of
the photo. The detector's own boxes can do that. Run it once on a small copy
of the photo, take the region the boxes cover, resize that region and run
the full read on it.

### 3.5 OpenCV.js

- **Size.** The official single-file build is 11.0 MB, 3.5 MB gzipped
  (4.13 and 4.14), or 15.9 MB and 4.5 MB (5.1.0). Measured from
  `docs.opencv.org/<version>/opencv.js`. The maintained npm packages
  ([@techstark/opencv-js](https://www.npmjs.com/package/@techstark/opencv-js),
  [@opencvjs/web](https://www.npmjs.com/package/@opencvjs/web)) repackage the
  same file.
- **CSP.** Every build inspected contains `new Function(...)` in its
  Emscripten binding code, some of it run at start-up. Under ErgScan's
  policy that should throw. This is from reading the files, not from running
  them in a browser. Emscripten's `-s DYNAMIC_EXECUTION=0` removes it
  ([settings](https://github.com/emscripten-core/emscripten/blob/main/src/settings.js)),
  but that means owning a custom build, and how small a build with only the
  image-processing functions gets is **unverified**.
- **Need.** The warp does not need it (3.2), and its contour functions are
  the weak method in 3.3.

### 3.6 Licence traps

- **Ultralytics YOLO** (v8, 11, 26). Its pose, oriented-box and segmentation
  variants are the obvious tools for finding a tilted screen. The code is
  AGPL-3.0, and Ultralytics states that "All Ultralytics YOLO trained models
  fall under the AGPL-3.0 License by default"
  ([licence page](https://www.ultralytics.com/license)). By that statement,
  shipping such weights would put ErgScan under AGPL-3.0 unless an
  enterprise licence is bought. That is their position, not legal advice.
- **RF-DETR.** The small models are under Roboflow's platform licence; the
  smallest Apache-2.0 one has 30.5 M parameters
  ([README](https://github.com/roboflow/rf-detr/blob/develop/README.md)).
- **YOLOv9, v10, v12 and MMYOLO** are GPL or AGPL.

## 4. Options: recognition, correction, capture

### 4.1 Engines that run in the browser

Download sizes are gzipped where measured.

| Engine | Download | Licence | Fits the CSP | Verdict |
| --- | --- | --- | --- | --- |
| Tesseract, stock model (today) | 4.0 MB | Apache-2.0 | yes | Baseline |
| Tesseract with a model trained on the PM font | about 2.5 MB | Apache-2.0 | yes | Possible; weak evidence (4.3) |
| PP-OCRv6 tiny on onnxruntime-web | about 9.5 MB: 3.8 runtime, 1.6 detector, 4.1 recogniser | MIT and Apache-2.0 | yes, from reading the shipped code | **Measured best here** |
| PP-OCRv5 mobile, the previous generation | about 15.6 MB with its English recogniser | Apache-2.0 | yes | Larger, and on PaddleOCR's own "Screen" test set its general mobile recogniser scores 57.6 against 71.2 for v6 tiny ([model card](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec)). Not measured here |
| PP-OCRv6 tiny recogniser retrained on the monitor's characters, rows cut without a detector | about 3.8 MB runtime plus about 2 MB (estimate) | Apache-2.0 | yes | The long-term target (4.3) |
| [ocrs](https://github.com/robertknight/ocrs) (Rust to WebAssembly) | 12 MB of models | code MIT or Apache; **models CC-BY-SA-4.0** | **unverified** | No npm build; share-alike weights |
| [Scribe.js](https://github.com/scribeocr/scribe.js) | 47.5 MB package, unpacked | **AGPL-3.0** | **unverified** | Licence rules it out |
| TrOCR small through Transformers.js | 63.6 MB quantised | **unverified** | yes | Too large |
| docTR through TensorFlow.js | n/a | Apache-2.0 | n/a | Dead: docTR dropped TensorFlow, and TensorFlow.js has had no release since October 2024 |
| Browser `TextDetector` | 0 | n/a | n/a | Behind a flag, not standardised ([Chrome](https://developer.chrome.com/docs/capabilities/shape-detection)) |
| Chrome's built-in Prompt API | 0 | n/a | n/a | Not on Android or iOS ([Chrome](https://developer.chrome.com/docs/ai/prompt-api)) |

No published comparison of Tesseract and a PaddleOCR-class model on photos
of dot-matrix displays was found. The nearest, on photos of printed signs,
reports character accuracy of 0.38 for Tesseract and 0.92 for PaddleOCR
([arXiv 2602.02223](https://arxiv.org/abs/2602.02223)). That is a different
score from the cells measured here, but the gap points the same way.

### 4.2 Running PP-OCRv6 in the browser

**Runtime.** [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web)
1.31.1 (MIT, 2026-10-26). Import `onnxruntime-web/wasm` to get the
WebAssembly-only build and self-host three files:

| File | Raw | Gzipped |
| --- | --- | --- |
| `ort-wasm-simd-threaded.wasm` | 14,848,852 | 3,799,585 |
| `ort-wasm-simd-threaded.mjs` | 24,738 | 9,186 |
| `ort.wasm.min.mjs` | 53,725 | 17,179 |

- **CSP.** "Since ONNX Runtime Web v1.19, the WebAssembly binary file(s) and
  workers can be loaded in CSP restricted environments"
  ([deploy guide](https://onnxruntime.ai/docs/tutorials/web/deploy.html)).
  The WebAssembly-only files contain no `eval` and no `new Function`. Leave
  `env.wasm.proxy` off, since the documentation says the proxy worker is
  made from a blob, and run the runtime inside ErgScan's own worker. Set
  `env.wasm.wasmPaths` to the self-hosted folder; the default is a CDN.
- **Threads.** Without cross-origin isolation the runtime sets itself to one
  thread. Adding `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` would allow up to four
  ([web.dev](https://web.dev/articles/coop-coep)). ErgScan loads nothing
  from other origins, so the cost is small, but whether the headers survive
  pages served from the service-worker cache is **unverified**. Measure one
  thread first.
- **SIMD is required**: Chrome 91, Firefox 89, Safari 16.4
  ([caniuse](https://caniuse.com/wasm-simd)).
- **WebGPU** is not worth it at this size. Its runtime file is twice as
  large and contains a `new Function`.
- **iOS memory.** WebKit bug
  [304810](https://bugs.webkit.org/show_bug.cgi?id=304810) (open) reports
  WebAssembly memory growing until the tab is killed on iOS 26. Test on an
  iPhone early.
- **Project risk.** `github.com/microsoft/onnxruntime` returned 404 on
  2026-11-25 and, by reports, since about 2026-11-17
  ([Hacker News](https://news.ycombinator.com/item?id=50539610)). The npm
  package still installs and `onnxruntime.ai` is up. The cause is
  **unverified**. Google's [LiteRT.js](https://developers.google.com/edge/litert/web)
  (Apache-2.0, 3.1 MB gzipped) is the alternative runtime; it takes `.tflite`
  models and its behaviour on iOS Safari is **unverified**.

**Glue code.** Between the two networks sits ordinary code: resize and
normalise the image, turn the detector's probability map into boxes, warp
each box upright, and decode the recogniser's output by taking the best
class per step and collapsing repeats.

- PaddleOCR's own [`@paddleocr/paddleocr-js`](https://www.npmjs.com/package/@paddleocr/paddleocr-js)
  (0.4.2) bundles OpenCV.js, so it has the `new Function` problem of 3.5,
  and by default it fetches models and the runtime from other origins.
- [`ppu-paddle-ocr`](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr)
  (MIT) and [`esearch-ocr`](https://github.com/xushengfeng/eSearch-OCR)
  (Apache-2.0) do the same job without OpenCV and take the runtime and
  models from the caller. Both are small single-maintainer projects. They
  are worth reading even if ErgScan writes its own glue, which is a few
  hundred lines.

### 4.3 A recogniser trained on the monitor's font

The screen draws one bitmap font and a small set of characters: the digits,
a few punctuation marks, and the letters of the headings and month names. A
model trained on exactly that should beat any general one. Two ways to get
there:

**Retrain the PP-OCRv6 tiny recogniser.**

- Half of its weights are the output layer for 6,906 characters. With a few
  dozen symbols the model would be roughly 2 MB. That figure is arithmetic
  from the layer shapes, not a published number.
- PaddleOCR's guidance: at least 5,000 line images when the character set is
  unchanged, more when it changes; mix real and synthetic lines; learning
  rate 1e-4 to 2e-5 from the pretrained weights
  ([fine-tuning guide](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version2.x/ppocr/model_train/finetune.en.md)).
  Training needs a GPU and Paddle's tools, then `paddle2onnx`.
- Published results on displays are encouraging, not conclusive. PaddleOCR's
  own case studies went from 52% to 72 to 79% of lines on a seven-segment
  meter with 110,000 synthetic lines
  ([case study](https://www.paddleocr.ai/v2.10.0/applications/%E5%85%89%E5%8A%9F%E7%8E%87%E8%AE%A1%E6%95%B0%E7%A0%81%E7%AE%A1%E5%AD%97%E7%AC%A6%E8%AF%86%E5%88%AB.html))
  and from 70% to 82% on LCD meters with 20,000 real crops
  ([case study](https://www.paddleocr.ai/v2.10.0/applications/%E6%B6%B2%E6%99%B6%E5%B1%8F%E8%AF%BB%E6%95%B0%E8%AF%86%E5%88%AB.html)).
  Both started from older, weaker models than PP-OCRv6.
- With a table whose rows sit at regular heights, the detector could be
  dropped: cut the rows by their position and read each as one line. That
  saves the detector's download and most of the run time.

**Fine-tune Tesseract.** No new runtime. The
[tesstrain](https://github.com/tesseract-ocr/tesstrain) workflow takes line
images with their text, starts from the floating-point `tessdata_best`
English model (the `best_int` model ErgScan ships cannot be a base) and
produces an integer model of about 1.5 MB, loaded through `langPath` under
its own name. The documentation's single-font example uses 400 iterations
and warns against more
([tessdoc](https://github.com/tesseract-ocr/tessdoc/blob/main/tess4/TrainingTesseract-4.00.md)).
The closest precedent is a 2019 project on dot-matrix print on medicine
packs: stock Tesseract 55% of characters, fine-tuned models 65 to 70%
([repository](https://github.com/ameera3/OCR_Expiration_Date)). That is a
smaller gain than the engine swap measured here.

**Training data.**

- The font is not published. Neither Concept2's documentation nor any
  community project found gives the glyphs or the LCD's pixel count; a
  reseller's listing says 320×240, **unverified**. The glyphs would be
  redrawn from close-up photos, which show every dot.
- Synthetic rows: render text in the redrawn font, then degrade it with
  blur, perspective, uneven light, reflections and the dot gaps.
  [Augraphy](https://github.com/sparkfish/augraphy) (MIT) has lighting and
  reflection effects;
  [text_renderer](https://github.com/oh-my-ocr/text_renderer) (MIT) is what
  PaddleOCR's guides use. Recent Albumentations is AGPL, which only matters
  if its code is redistributed.
- Real rows: the 75 labelled photos hold 524 labelled rows. Cut out with
  PP-OCRv6's boxes, they are the validation set. Split the photos before
  training anything, so a held-out set stays honest.
- A fixed layout tempts a model to learn the layout and not the glyphs.
  Tesseract's notes call this the hallucination effect
  ([tessdoc](https://github.com/tesseract-ocr/tessdoc/blob/main/tess4/The-Hallucination-Effect.md)).
  Vary the synthetic text beyond what a real screen shows.

### 4.4 Getting more from Tesseract

If Tesseract stays, even only as a fallback, these are grounded in its
source. Section 2.5 has the ones that were measured.

- **Second-best characters are available.** `lstm_choice_mode: '2'` with
  hOCR output returns up to six ranked candidates per character. Lower
  `lstm_rating_coefficient` from 5 to about 1 or most of them score 0. The
  `blocks` output does not carry them. This is what an arithmetic check
  needs to choose between `3` and `8`.
- **A whitelist works with the LSTM engine** since Tesseract 4.1 and can be
  set per call. It deletes other characters, it does not map them to
  digits, so use it on data rows and never on the heading row.
- **The recogniser reads the pixels it is given**, not Tesseract's own
  binarisation. Passing the thresholded image means it reads thresholded
  pixels. `thresholding_method` only changes how rows and words are found.
- **Settings that do nothing with the LSTM engine**:
  `load_freq_dawg`, `classify_bln_numeric_mode`, and
  `textord_tabfind_find_tables` in single-block mode.
- **Patterns** such as `\d:\d\d.\d` load through `user_patterns_file`, at
  worker start only, and act as a nudge, not a rule.

### 4.5 Correcting after recognition

- **Format.** Every column has a shape: times are `m:ss.t` or `h:mm:ss.t`,
  meters and rates are whole numbers. A pace read as `2105.2` can only be
  `2:05.2`, since nobody rows 500 m in 21 minutes. This is the largest
  single gain on offer for PP-OCRv6 (2.6).
- **Arithmetic.** Pace equals time over distance in every row, and the
  splits add up to the total. `scanTrust.ts` already scores a read this way.
  The next step is to use the checks to choose between candidate readings
  of a cell, not only between whole reads.
- **Two engines.** If Tesseract stays installed beside PP-OCRv6, the trust
  score can pick between their reads as it does today between two crops.
  Measured on the 75 photos, that adds little: 94.5% of fields and 41 whole
  workouts, against 94.1% and 38 for PP-OCRv6 alone on the photo shrunk to
  1000 px. Always picking the better of the two would give 95.2% and 43. It
  costs the 4 MB Tesseract download and a second read.
- **Several frames.** Reading three to five frames and voting per cell is
  the standard remedy for errors that change from frame to frame. The
  method is ROVER, from speech recognition
  ([Fiscus 1997](https://doi.org/10.1109/ASRU.1997.659110)), and it has been
  applied to text fields in phone video
  ([Bulatov 2019](https://arxiv.org/abs/1910.04107)). It costs one read per
  frame and suits glare, which moves when the phone moves.

### 4.6 Capture

- **Resolution.** `ImageCapture.takePhoto()` returns the camera's still
  resolution, where a grabbed video frame has only the stream's
  ([Chrome](https://developer.chrome.com/blog/imagecapture)). It is in Chrome
  and, since 18.4, Safari
  ([release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)).
  What iOS returns from it is **unverified**. With PP-OCRv6 wanting the
  screen only 800 px wide, resolution matters less than it does today.
- **Sharpness and steadiness.** The variance of a Laplacian filter over the
  screen region is a few lines of code and tells a sharp frame from a
  blurred one. Capturing on its own when the frame is sharp and still would
  remove the worst photos before OCR sees them.
- **Glare.** The torch would add a reflection. Frames from slightly
  different angles, aligned and combined by taking the darkest value per
  pixel, remove moving highlights; Google's PhotoScan works this way
  ([Google Research](https://research.google/blog/photoscan-taking-glare-free-pictures-of-pictures/)).
  That needs aligned frames, so it comes after everything else here.

## 5. Recommendations

### R1. Add a `rotateAuto` read to Tesseract's retry

In `readPhoto`, when the first read does not add up, read once more with
`{ rotateAuto: true }` and keep the read `scanTrust` prefers, as the
heading-row retry does today. Estimated from the measured outputs, that
gives 84% of fields and 18 whole workouts against 83% and 12, on photos that
are mostly straight (2.3, 2.5). Do not turn it on for every read: alone it
made 11 photos worse. This is worth doing only while Tesseract is the
engine. A projection-profile deskew before the crop (3.1) is the fuller fix
if it stays.

### R2. Prototype PP-OCRv6 tiny behind the `Recognizer` interface

`readPhoto` already takes its OCR engine as a `Recognizer` with `text` and
`words`. A detector and recogniser supply both. But the interface passes a
grey image, which cost 8 whole workouts (2.6), and `readPhoto` applies
Tesseract's preprocessing, which PP-OCRv6 does not need. So the engine may
be better off reading the colour photo on a path of its own. The prototype:

1. Self-host the three runtime files and two models under `public/`, cached
   like the Tesseract files.
2. Run them in a same-origin module worker: WebAssembly only, one thread, no
   proxy.
3. Write the glue of 4.2 in TypeScript, reading `ppu-paddle-ocr` and
   `esearch-ocr` for reference.
4. Give `npm run eval` the same engine, so every later step has a number.
   onnxruntime-web runs in Node, as section 2.6 used it.
5. Measure on a mid-range Android phone and an iPhone: time to first read,
   time per read, peak memory.

Then decide between replacing Tesseract (about 9.5 MB in place of 4.0 MB)
and keeping both (about 13.5 MB) with the trust score choosing. The
measurement in 4.5 says the second reader adds little, so replacing is the
likely answer if the phone numbers hold.

### R3. Give the recogniser a photo of known size

Start by shrinking the whole photo to about 1000 px on its long side. That
alone gave 94% of fields with no screen detection (2.6), so the prototype
does not need `findScreen`. Then try the refinement: find the text region
from the detector's boxes on that small copy, crop it from the full photo,
resize it to about 800 px wide and read again. On the labelled rectangle
that was worth one more point. Both sizes are single values that were tried,
so sweep them in the eval.

### R4. Teach the parser the new engine's mistakes

Colon read as `1`, missing colons and points, cells joined together. Resolve
them with the column formats and the row arithmetic (4.5). The measured
headroom is from 71% of rows exactly right to 96% with all digits right.
Add that looser score to `testdata/score.ts`, since it shows what the parser
has left to gain.

### R5. Train a recogniser on the monitor's font

Only after R2 to R4, when the remaining errors are known. Redraw the font,
build a renderer, hold out part of the labelled photos, retrain the
PP-OCRv6 tiny recogniser on a small character set, and compare on the
held-out photos. The reward is a smaller download, a faster read and the
last few percent.

### R6. Make the eval harder

- Add photos that are tilted, side-on and less careful. The current set is
  straighter than real use (2.3).
- Add `--rot` and `--yaw` switches to `npm run eval` that warp each photo,
  so tilt is tested on every run. The code exists from this research
  (section 7).
- Split the photos into a tuning set and a held-out set before any training.

### R7. Capture, later

A sharpness and steadiness gate first, then voting across frames (4.5, 4.6).
Each is independent of the engine.

### Not recommended

- **A model that finds the screen's box.** Finding 2.
- **A corner-finding model now.** Revisit if side-on photos still fail after
  R2 and R3. The plan is in 3.4.
- **OpenCV.js.** Section 3.5.
- **Ultralytics YOLO, Scribe.js, ocrs models.** Licences (3.6, 4.1).
- **Cross-origin isolation for threads, or WebGPU, at this stage.** Measure
  one thread first.

## 6. Open questions and what was not verified

- **Speed and memory on phones.** No source publishes single-threaded
  browser timings for these models on current phones, and none were
  measured here.
- **iOS Safari.** Whether the WebKit memory bug affects models this small.
- **Whether the CSP verdicts hold in a browser.** They come from reading
  shipped code: onnxruntime-web's WebAssembly-only build should load,
  OpenCV.js and PaddleOCR's own SDK should not.
- **Why ONNX Runtime's repository is gone** and whether it returns.
- **How good a font-specific recogniser gets.** Published display results
  improved with fine-tuning but stayed below the high nineties.
- **The LCD's pixel grid and font.** Not published.
- **The best screen width for PP-OCRv6**, and whether PP-OCRv6 small (31 MB
  of models, slower) is worth its size. Neither was measured.
- **Quantising the models to 8 bits** would cut the download by up to four
  times. Only a maintainer's claim for an older model was found; accuracy
  after quantising is **unverified**.

## 7. How the measurements were made

- **Photos and labels**: the 75 single-photo fact files in `testdata/`.
  Scoring is `scoreOcr` and `scoreWorkout` from `testdata/score.ts`, and
  parsing is `parsePm5Text`, all unchanged.
- **Tesseract runs**: `npm run eval`, `npm run eval -- --framed`, and a copy
  of the eval loop that passes extra options to tesseract.js.
- **Screen detection**: `findScreen` against each photo's `screenRect`. A
  crop counts as bad when nothing is found, less than 95% of the labelled
  screen is inside it, or the overlap ratio is under 0.5.
- **PP-OCRv6**: the [RapidOCR](https://github.com/RapidAI/RapidOCR) Python
  package 3.10.0 (Apache-2.0) on ONNX Runtime 1.23.2, with its orientation
  classifier off and a text score threshold of 0.3. It runs RapidOCR's own
  ONNX conversions of the PaddleOCR models, which differ from PaddlePaddle's
  files by a few kilobytes. Boxes were grouped into rows after removing the
  median box angle, a box joining a row when its centre is within half a box
  height of the row's.
- **Tilt**: each photo warped with a homography before any other step.
  Rotation is about the photo's centre. "From the side" turns the photo
  about its vertical axis in front of a camera whose focal length is 1.5
  times the photo's long side. Pixels from outside the photo repeat the
  edge. For PP-OCRv6 the labelled rectangle was not moved to follow the
  warp, so those runs lose a little of the screen at the larger angles.
- **Tilt of the test photos**: the median angle of PP-OCRv6's text boxes
  wider than 30 px, on the whole photo.
- **WebAssembly check**: onnxruntime-web 1.31.1 in Node 24, one thread, fed
  the same input tensors as native ONNX Runtime for one photo.
- **Machine**: Intel Celeron J3455 (4 cores, 1.5 GHz, no AVX), busy with
  other work during most runs. Timings are rough and are not phone timings.

The scripts and raw results are not committed. On the machine that ran them
they are in `.scratch/ocr-research/`, which git ignores.

## 8. Sources

Measurements are this project's own. External sources, by topic:

**Tesseract and tesseract.js**

- Improving quality: https://github.com/tesseract-ocr/tessdoc/blob/main/ImproveQuality.md
- Training: https://github.com/tesseract-ocr/tessdoc/blob/main/tess5/TrainingTesseract-5.md and https://github.com/tesseract-ocr/tessdoc/blob/main/tess4/TrainingTesseract-4.00.md
- Skew test: https://github.com/tesseract-ocr/tesseract/issues/4116
- The LSTM reads original pixels: https://github.com/tesseract-ocr/tesseract/pull/4111
- tesseract.js worker source (`rotateAuto`, per-call options): https://github.com/naptha/tesseract.js/blob/master/src/worker-script/index.js
- tesstrain: https://github.com/tesseract-ocr/tesstrain
- Dot-matrix fine-tuning precedent: https://github.com/ameera3/OCR_Expiration_Date
- Leptonica skew detection: https://github.com/DanBloomberg/leptonica/blob/master/src/skew.c

**PaddleOCR**

- Release 3.7.0 (PP-OCRv6): https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.7.0
- Technical report: https://arxiv.org/abs/2606.13108
- Models: https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx and https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx
- Per-scenario accuracy table: https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec
- Fine-tuning guide: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version2.x/ppocr/model_train/finetune.en.md
- Browser packages: https://www.npmjs.com/package/@paddleocr/paddleocr-js , https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr , https://github.com/xushengfeng/eSearch-OCR

**Runtimes**

- onnxruntime-web: https://www.npmjs.com/package/onnxruntime-web , https://onnxruntime.ai/docs/tutorials/web/deploy.html , https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- LiteRT.js: https://developers.google.com/edge/litert/web
- Cross-origin isolation: https://web.dev/articles/coop-coep
- WebKit memory bug: https://bugs.webkit.org/show_bug.cgi?id=304810

**Alignment**

- SmartDoc 2015: https://doi.org/10.1109/ICDAR.2015.7333943
- Dropbox document detection: https://dropbox.tech/machine-learning/fast-and-accurate-document-detection-for-scanning
- LDRNet: https://arxiv.org/abs/2206.02136
- DocAligner: https://github.com/DocsaidLab/DocAligner and https://docsaid.org/en/docs/docaligner/benchmark/
- OpenCV.js build script and whitelist: https://github.com/opencv/opencv/blob/4.x/platforms/js/build_js.py
- perspective-transform: https://github.com/jlouthan/perspective-transform
- Ultralytics licence: https://www.ultralytics.com/license

**Capture and correction**

- Image Capture: https://w3c.github.io/mediacapture-image/ and https://developer.chrome.com/blog/imagecapture
- ROVER: https://doi.org/10.1109/ASRU.1997.659110
- Combining readings across video frames: https://arxiv.org/abs/1910.04107
- PhotoScan: https://research.google/blog/photoscan-taking-glare-free-pictures-of-pictures/
