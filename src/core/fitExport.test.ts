import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { workoutToFit } from './fitExport';
import { parsePm5Text } from './pm5Parser';
import type { Workout } from './workout';

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return {
    sessionMesgs: messages.sessionMesgs ?? [],
    lapMesgs: messages.lapMesgs ?? [],
    recordMesgs: messages.recordMesgs ?? [],
    activityMesgs: messages.activityMesgs ?? [],
    workoutMesgs: messages.workoutMesgs ?? [],
  };
}

function decodeDeveloperFields(bytes: Uint8Array) {
  const names = new Map<number, string>();
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  const { messages, errors } = decoder.read({
    fieldDescriptionListener: (key, _, description) => void names.set(key, description.fieldName!),
  });
  expect(errors).toEqual([]);
  return {
    fieldDescriptions: (messages.fieldDescriptionMesgs ?? []).map(({ fieldName, nativeMesgNum }) => ({ fieldName, nativeMesgNum })),
    sessions: (messages.sessionMesgs ?? []).map((s) =>
      Object.fromEntries(Object.entries(s.developerFields ?? {}).map(([key, value]) => [names.get(Number(key)), value])),
    ),
  };
}

function workoutFrom(text: string): Workout {
  const scan = parsePm5Text(text)!;
  return { startTime: new Date('2026-11-16T07:00:00Z'), splitDistance: scan.splitDistance, dragFactor: null, name: null, notes: null, summary: scan.summary, rows: scan.rows };
}

describe('workoutToFit', () => {
  it('encodes an indoor rowing session with one lap per split', () => {
    const workout = workoutFrom(`
      time meter /500m s/m
      7:30.0 2000 1:52.5 28
      1:53.0 500 1:53.0 27
      1:52.5 500 1:52.5 28
      1:52.6 500 1:52.6 28
      1:51.9 500 1:51.9 29
    `);
    const m = decode(workoutToFit(workout));

    const session = m.sessionMesgs[0]!;
    expect(session.sport).toBe('rowing');
    expect(session.subSport).toBe('indoorRowing');
    expect(session.totalDistance).toBe(2000);
    expect(session.totalTimerTime).toBe(450);
    expect(session.avgCadence).toBe(28);
    expect(session.avgPower).toBe(246);
    expect(session.startTime).toEqual(workout.startTime);

    expect(m.lapMesgs).toHaveLength(4);
    expect(m.lapMesgs[0]).toMatchObject({ totalElapsedTime: 113, totalDistance: 500, avgCadence: 27, intensity: 'active' });

    const lastRecord = m.recordMesgs.at(-1)!;
    expect(lastRecord.distance).toBe(2000);
    expect(lastRecord.timestamp).toEqual(new Date('2026-11-16T07:07:30Z'));
    expect(m.activityMesgs).toHaveLength(1);
  });

  it('marks rest intervals as rest laps and keeps rest meters out of the record distance', () => {
    const workout = workoutFrom(`
      time meter /500m s/m ♡
      4:00.0 1000 2:00.0 24 150
      2:00.0 500 2:00.0 24 145
      r1:00 r23
      2:00.0 500 2:00.0 24 155
    `);
    const m = decode(workoutToFit(workout));

    expect(m.lapMesgs.map((l) => l.intensity)).toEqual(['active', 'rest', 'active']);
    expect(m.lapMesgs[1]).toMatchObject({ totalElapsedTime: 60, totalDistance: 23 });
    expect(m.lapMesgs[2]!.avgHeartRate).toBe(155);
    expect(m.sessionMesgs[0]).toMatchObject({ totalElapsedTime: 300, totalDistance: 1000, avgHeartRate: 150 });
    expect(m.recordMesgs.at(-1)!.distance).toBe(1000);
  });

  it('carries the drag factor as a developer field on the session', () => {
    const workout = { ...workoutFrom('time meter /500m s/m\n4:00.0 1000 2:00.0 24'), dragFactor: 125 };
    const { fieldDescriptions, sessions } = decodeDeveloperFields(workoutToFit(workout));
    expect(fieldDescriptions).toEqual([{ fieldName: 'Drag Factor', nativeMesgNum: 18 }]);
    expect(sessions).toEqual([{ 'Drag Factor': 125 }]);
  });

  it('names the workout and describes it with the notes and drag factor', () => {
    const workout = { ...workoutFrom('time meter /500m s/m\n4:00.0 1000 2:00.0 24'), name: 'Test day', notes: 'Felt strong', dragFactor: 125 };
    const [wkt] = decode(workoutToFit(workout)).workoutMesgs;
    expect(wkt).toMatchObject({ wktName: 'Test day', wktDescription: 'Felt strong\nDrag factor 125', sport: 'rowing', subSport: 'indoorRowing' });
  });

  it('cuts a long name and notes to what FIT strings can hold', () => {
    const notes = 'æ'.repeat(400);
    const workout = { ...workoutFrom('time meter /500m s/m\n4:00.0 1000 2:00.0 24'), name: 'ø'.repeat(200), notes: `  ${notes}\n\n` };
    const [wkt] = decode(workoutToFit(workout)).workoutMesgs;
    expect(wkt!.wktName).toBe('ø'.repeat(127));
    expect(wkt!.wktDescription).toBe('æ'.repeat(127));
  });

  it('falls back to the suggested name and leaves out an empty description', () => {
    const [wkt] = decode(workoutToFit(workoutFrom('time meter /500m s/m\n4:00.0 1000 2:00.0 24'))).workoutMesgs;
    expect(wkt!.wktName).toBe('1000m');
    expect(wkt!.wktDescription).toBeUndefined();
  });

  it('writes no developer data without a drag factor', () => {
    const { fieldDescriptions, sessions } = decodeDeveloperFields(workoutToFit(workoutFrom('time meter /500m s/m\n4:00.0 1000 2:00.0 24')));
    expect(fieldDescriptions).toEqual([]);
    expect(sessions).toEqual([{}]);
  });

  it('falls back to the summary as a single lap when there are no split rows', () => {
    const workout = workoutFrom('time meter /500m s/m\n4:00.0 1000 2:00.0 24');
    const m = decode(workoutToFit(workout));
    expect(m.lapMesgs).toHaveLength(1);
    expect(m.lapMesgs[0]).toMatchObject({ totalDistance: 1000, avgPower: 203 });
  });
});
