import { describe, expect, it } from 'vitest';
import { workoutToFit } from './fitExport';
import { readWatchFile, WatchFileError } from './watchFile';
import { emptyRow, type Workout } from './workout';

/** A FIT activity with five minutes of rowing at 24 strokes a minute and a heart rate climbing from 120. */
function activity(): Uint8Array {
  const workout: Workout = {
    startTime: new Date('2026-11-18T16:15:14Z'),
    splitDistance: 500,
    dragFactor: null,
    name: null,
    notes: null,
    feeling: null,
    summary: { ...emptyRow(), durationDs: 3000, distanceM: 1200, rate: 24 },
    rows: [],
    heartRates: Array.from({ length: 300 }, (_, s) => 120 + Math.floor(s / 10)),
  };
  return workoutToFit(workout);
}

/** A ZIP with one stored entry, the way the reader expects Garmin Connect's export to be laid out. */
function storedZip(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);
  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, nameBytes.length, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

async function problem(bytes: Uint8Array) {
  try {
    await readWatchFile(bytes);
    return null;
  } catch (error) {
    return error instanceof WatchFileError ? error.problem : error;
  }
}

describe('readWatchFile', () => {
  it('reads heart rate and stroke rate per second from a FIT activity', async () => {
    const watch = await readWatchFile(activity());
    expect(watch.start).toEqual(new Date('2026-11-18T16:15:14Z'));
    expect(watch.heartRate).toHaveLength(301);
    expect(watch.heartRate[0]).toBe(120);
    expect(watch.heartRate[125]).toBe(132);
    expect(watch.cadence[60]).toBe(24);
  });

  it('reads the FIT file inside a Garmin Connect export', async () => {
    const watch = await readWatchFile(storedZip('25121807799_ACTIVITY.fit', activity()));
    expect(watch.heartRate[125]).toBe(132);
  });

  it('says what is wrong with a file it cannot use', async () => {
    expect(await problem(storedZip('summary.csv', new Uint8Array([1, 2, 3])))).toBe('noFit');
    expect(await problem(new TextEncoder().encode('not a FIT file at all'))).toBe('unreadable');
  });

  it('turns down an activity without heart rate', async () => {
    const workout: Workout = {
      startTime: new Date('2026-11-18T16:15:14Z'),
      splitDistance: 500,
      dragFactor: null,
      name: null,
      notes: null,
      feeling: null,
      summary: { ...emptyRow(), durationDs: 600, distanceM: 200, rate: 24 },
      rows: [],
      heartRates: null,
    };
    expect(await problem(workoutToFit(workout))).toBe('noHeartRate');
  });
});
