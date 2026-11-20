import { describe, expect, it } from 'vitest';
import { align, hasHeartRate, resample, withWatchHeartRate, workoutSeconds, type WatchRecording } from './watchHeartRate';
import { emptyRow, type Workout, type WorkoutRow } from './workout';

const row = (fields: Partial<WorkoutRow>): WorkoutRow => ({ ...emptyRow(), ...fields });

function workout(rows: WorkoutRow[], summary: Partial<WorkoutRow> = {}): Workout {
  return {
    startTime: new Date('2026-11-18T16:20:00Z'),
    splitDistance: 500,
    dragFactor: null,
    name: null,
    notes: null,
    feeling: null,
    summary: row(summary),
    rows,
    heartRates: null,
  };
}

/** 40:00 in five 8:00 splits, as in testdata/pm4-time-splits-40min-calhr. */
const RATES = [25, 27, 23, 24, 19];
const fortyMinutes = () => workout(RATES.map((rate) => row({ durationDs: 4800, rate })), { durationDs: 24000, rate: 23 });

const WATCH_START = new Date('2026-11-18T16:15:14Z');

/**
 * A watch that starts `lead` seconds after the erg (negative: before) and records `length` seconds:
 * stroke rate wobbling around each split's rate, and a heart rate of 100 + 10 per split.
 */
function recording(lead: number, length: number, rates = RATES, splitS = 480): WatchRecording {
  const heartRate: (number | null)[] = [];
  const cadence: (number | null)[] = [];
  for (let t = 0; t < length; t++) {
    const ergT = t + lead;
    const split = Math.floor(ergT / splitS);
    const rowing = ergT >= 0 && split < rates.length;
    cadence.push(rowing ? rates[split]! + Math.round(2 * Math.sin(t / 7)) : 0);
    heartRate.push(rowing ? 100 + 10 * split : 90);
  }
  return { start: WATCH_START, heartRate, cadence };
}

describe('align', () => {
  it('finds where the erg started from the stroke rate of each split', () => {
    const alignment = align(fortyMinutes(), recording(22, 2397));
    expect(alignment?.byStrokeRate).toBe(true);
    expect(Math.abs(alignment!.offsetS - -22)).toBeLessThanOrEqual(3);
  });

  it('finds a workout that started minutes into the recording', () => {
    const alignment = align(fortyMinutes(), recording(-300, 3000));
    expect(alignment?.byStrokeRate).toBe(true);
    expect(Math.abs(alignment!.offsetS - 300)).toBeLessThanOrEqual(3);
  });

  it('places a single piece where the watch first counted strokes', () => {
    const single = workout([], { durationDs: 24000, rate: 23 });
    const watch = recording(-45, 2500);
    expect(align(single, watch)).toEqual({ offsetS: 45, byStrokeRate: false });
  });

  it('falls back when the splits do not match the watch', () => {
    const steady = workout([30, 30, 30].map((rate) => row({ durationDs: 6000, rate })));
    expect(align(steady, recording(0, 1800, [18, 18, 18], 600))?.byStrokeRate).toBe(false);
  });

  it('gives up on a recording that covers less than half the workout', () => {
    expect(align(fortyMinutes(), recording(0, 1000))).toBeNull();
  });
});

describe('withWatchHeartRate', () => {
  it('fills each split, the summary, the series and the start time', () => {
    const result = withWatchHeartRate(fortyMinutes(), recording(22, 2397), { offsetS: -22, byStrokeRate: true });
    expect(result.rows.map((r) => r.heartRate)).toEqual([100, 110, 120, 130, 140]);
    expect(result.summary.heartRate).toBe(120);
    expect(result.heartRates).toHaveLength(workoutSeconds(result));
    expect(result.heartRates!.slice(0, 22).every((v) => v === null)).toBe(true);
    expect(result.heartRates![22]).toBe(100);
    expect(result.startTime.toISOString()).toBe('2026-11-18T16:14:52.000Z');
  });

  it('averages the summary over work splits only', () => {
    const intervals = workout([row({ durationDs: 600 }), row({ durationDs: 600, isRest: true }), row({ durationDs: 600 })]);
    const watch: WatchRecording = {
      start: WATCH_START,
      heartRate: [...Array(60).fill(150), ...Array(60).fill(100), ...Array(60).fill(170)],
      cadence: Array(180).fill(20),
    };
    const result = withWatchHeartRate(intervals, watch, { offsetS: 0, byStrokeRate: false });
    expect(result.rows.map((r) => r.heartRate)).toEqual([150, 100, 170]);
    expect(result.summary.heartRate).toBe(160);
  });

  it('keeps the value from the monitor where the watch has nothing', () => {
    const w = workout([row({ durationDs: 600, heartRate: 140 }), row({ durationDs: 600, heartRate: 150 })]);
    const watch: WatchRecording = { start: WATCH_START, heartRate: [...Array(60).fill(120), ...Array(60).fill(null)], cadence: Array(120).fill(20) };
    expect(withWatchHeartRate(w, watch, { offsetS: 0, byStrokeRate: false }).rows.map((r) => r.heartRate)).toEqual([120, 150]);
  });
});

describe('resample', () => {
  const at = (s: number) => new Date(WATCH_START.getTime() + s * 1000);

  it('lays samples out per second and carries values over short gaps', () => {
    const watch = resample([
      { timestamp: at(0), heartRate: 80, cadence: 0 },
      { timestamp: at(4), heartRate: 90, cadence: 22 },
      { timestamp: at(30), heartRate: 100 },
    ])!;
    expect(watch.start).toEqual(WATCH_START);
    expect(watch.heartRate.slice(0, 6)).toEqual([80, 80, 80, 80, 90, 90]);
    expect(watch.heartRate[14]).toBe(90);
    expect(watch.heartRate[15]).toBeNull();
    expect(watch.heartRate[30]).toBe(100);
    expect(watch.cadence[30]).toBeNull();
  });

  it('ignores zero heart rate, which watches log when the sensor has lost contact', () => {
    const watch = resample([{ timestamp: at(0), heartRate: 0 }, { timestamp: at(20), heartRate: 0 }])!;
    expect(hasHeartRate(watch)).toBe(false);
  });

  it('returns null without samples', () => {
    expect(resample([])).toBeNull();
  });
});
