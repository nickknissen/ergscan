import type { Workout, WorkoutRow } from './workout';

/** A watch recording resampled to one value per second from `start`; null where the watch has nothing. */
export interface WatchRecording {
  start: Date;
  heartRate: (number | null)[];
  cadence: (number | null)[];
}

export interface WatchSample {
  timestamp: Date;
  heartRate?: number | null;
  cadence?: number | null;
}

/** How the workout lines up with the recording: it starts `offsetS` seconds after the watch did (negative: before). */
export interface Alignment {
  offsetS: number;
  /** Matched on each split's stroke rate; otherwise placed where the watch first counted strokes. */
  byStrokeRate: boolean;
}

/** Watches with smart recording log every few seconds; values are carried over gaps up to this long. */
const MAX_GAP_S = 10;
/** A stroke-rate match counts only when the splits agree with the watch to within this many strokes a minute. */
const MAX_RATE_ERROR = 2;
/** Offsets must cover at least this share of the workout that the recording could possibly cover. */
const MIN_RELATIVE_COVERAGE = 0.9;

export function resample(samples: WatchSample[]): WatchRecording | null {
  const sorted = samples.filter((s) => !Number.isNaN(s.timestamp.getTime())).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return null;
  const start = first.timestamp;
  const length = Math.round((last.timestamp.getTime() - start.getTime()) / 1000) + 1;
  const heartRate: (number | null)[] = Array.from({ length }, () => null);
  const cadence: (number | null)[] = Array.from({ length }, () => null);
  for (const sample of sorted) {
    const at = Math.round((sample.timestamp.getTime() - start.getTime()) / 1000);
    if (validNumber(sample.heartRate) && sample.heartRate > 0) heartRate[at] = sample.heartRate;
    if (validNumber(sample.cadence)) cadence[at] = sample.cadence;
  }
  fillGaps(heartRate);
  fillGaps(cadence);
  return { start, heartRate, cadence };
}

function validNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fillGaps(values: (number | null)[]): void {
  let last: number | null = null;
  let lastAt = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value !== null && value !== undefined) {
      last = value;
      lastAt = i;
    } else if (last !== null && i - lastAt <= MAX_GAP_S) {
      values[i] = last;
    }
  }
}

export function hasHeartRate(recording: WatchRecording): boolean {
  return recording.heartRate.some((v) => v !== null);
}

export interface Span {
  row: WorkoutRow;
  from: number;
  to: number;
}

/** The rows of the workout laid out in seconds from its start. */
export function spans(workout: Workout): Span[] {
  const rows = workout.rows.length > 0 ? workout.rows : [workout.summary];
  let at = 0;
  return rows.map((row) => {
    const from = at;
    at += Math.round((row.durationDs ?? 0) / 10);
    return { row, from, to: at };
  });
}

export function workoutSeconds(workout: Workout): number {
  return spans(workout).at(-1)?.to ?? 0;
}

function mean(values: (number | null | undefined)[]): { mean: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    sum += value;
    count++;
  }
  return { mean: count > 0 ? sum / count : NaN, count };
}

function slice(values: (number | null)[], from: number, to: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = from; i < to; i++) out.push(i >= 0 && i < values.length ? (values[i] ?? null) : null);
  return out;
}

/**
 * Where the workout sits inside the watch recording. Splits with a stroke rate are matched against
 * the watch's stroke rate; with fewer than two of those, or no convincing match, the workout is placed
 * where the watch first counted strokes. Null when the recording covers less than half the workout.
 */
export function align(workout: Workout, recording: WatchRecording): Alignment | null {
  const total = workoutSeconds(workout);
  const length = recording.cadence.length;
  if (total <= 0 || length <= 0) return null;
  const bestCoverage = Math.min(total, length) / total;
  if (bestCoverage < 0.5) return null;
  const coverage = (offset: number) => Math.max(0, Math.min(offset + total, length) - Math.max(offset, 0)) / total;

  const rated = spans(workout).filter(({ row, from, to }) => !row.isRest && row.rate !== null && to > from);
  if (rated.length >= 2) {
    // Running totals, so each split's mean stroke rate at any offset costs two lookups.
    const sums = [0];
    const counts = [0];
    for (const value of recording.cadence) {
      sums.push(sums.at(-1)! + (value ?? 0));
      counts.push(counts.at(-1)! + (value === null ? 0 : 1));
    }
    const clamp = (i: number) => Math.max(0, Math.min(length, i));
    let best: { offset: number; error: number; coverage: number } | null = null;
    for (let offset = -total; offset <= length; offset++) {
      const covered = coverage(offset);
      if (covered < bestCoverage * MIN_RELATIVE_COVERAGE) continue;
      let squares = 0;
      let scored = 0;
      for (const { row, from, to } of rated) {
        const a = clamp(offset + from);
        const b = clamp(offset + to);
        const count = counts[b]! - counts[a]!;
        if (count < (to - from) / 2) continue;
        squares += ((sums[b]! - sums[a]!) / count - row.rate!) ** 2;
        scored++;
      }
      if (scored < 2) continue;
      const error = Math.sqrt(squares / scored);
      const better =
        !best ||
        error < best.error - 1e-9 ||
        (Math.abs(error - best.error) <= 1e-9 && (covered > best.coverage || (covered === best.coverage && Math.abs(offset) < Math.abs(best.offset))));
      if (better) best = { offset, error, coverage: covered };
    }
    if (best && best.error <= MAX_RATE_ERROR) return { offsetS: best.offset, byStrokeRate: true };
  }

  const firstStroke = recording.cadence.findIndex((c) => c !== null && c > 0);
  return { offsetS: firstStroke > 0 ? firstStroke : 0, byStrokeRate: false };
}

/**
 * The workout with heart rate from the recording: the series for each second, each split's average,
 * the summary's average over the work splits, and the start time from the watch clock.
 */
export function withWatchHeartRate(workout: Workout, recording: WatchRecording, alignment: Alignment): Workout {
  const { offsetS } = alignment;
  const total = workoutSeconds(workout);
  const series = slice(recording.heartRate, offsetS, offsetS + total);
  const averageOver = (ranges: { from: number; to: number }[]): number | null => {
    const values = ranges.flatMap(({ from, to }) => series.slice(from, to));
    const { mean: average, count } = mean(values);
    return count > 0 ? Math.round(average) : null;
  };

  const laid = spans(workout);
  const rowRates = laid.map(({ row, from, to }) => averageOver([{ from, to }]) ?? row.heartRate);
  const rows = workout.rows.map((row, i) => ({ ...row, heartRate: rowRates[i] ?? row.heartRate }));
  const work = laid.filter(({ row }) => !row.isRest);
  const summaryRate = averageOver(work.length > 0 ? work : laid) ?? workout.summary.heartRate;

  return {
    ...workout,
    startTime: new Date(recording.start.getTime() + offsetS * 1000),
    summary: { ...workout.summary, heartRate: summaryRate },
    rows,
    heartRates: series,
  };
}
