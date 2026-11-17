import {
  Encoder,
  type ActivityMesg,
  type DeveloperDataIdMesg,
  type Encodable,
  type EventMesg,
  type FieldDescriptionMesg,
  type FileIdMesg,
  type LapMesg,
  type Mesg,
  type RecordMesg,
  type SessionMesg,
} from '@garmin/fitsdk';
import { wattsForSplit, type Workout, type WorkoutRow } from './workout';

const MesgNum = {
  FILE_ID: 0,
  SESSION: 18,
  LAP: 19,
  RECORD: 20,
  EVENT: 21,
  ACTIVITY: 34,
  FIELD_DESCRIPTION: 206,
  DEVELOPER_DATA_ID: 207,
} as const;

/** FIT has no standard drag factor field, so it travels as an ErgScan developer field on the session. */
const DRAG_FACTOR_FIELD = {
  key: 0,
  developerDataId: {
    mesgNum: MesgNum.DEVELOPER_DATA_ID,
    applicationId: [217, 42, 26, 12, 15, 91, 66, 212, 142, 158, 187, 84, 176, 190, 105, 47],
    developerDataIndex: 0,
    applicationVersion: 1,
  } satisfies Encodable<DeveloperDataIdMesg>,
  fieldDescription: {
    mesgNum: MesgNum.FIELD_DESCRIPTION,
    developerDataIndex: 0,
    fieldDefinitionNumber: 0,
    fitBaseTypeId: 0x84, // uint16
    fieldName: 'Drag Factor',
    nativeMesgNum: MesgNum.SESSION,
  } satisfies Encodable<FieldDescriptionMesg>,
};

const FIT = {
  fileActivity: 4,
  manufacturerDevelopment: 255,
  sportRowing: 15,
  subSportIndoorRowing: 14,
  intensityActive: 0,
  intensityRest: 1,
  lapTriggerManual: 0,
  sessionTriggerActivityEnd: 0,
  eventTimer: 0,
  eventLap: 9,
  eventSession: 8,
  eventActivity: 26,
  eventTypeStart: 0,
  eventTypeStop: 1,
  eventTypeStopAll: 4,
  activityManual: 0,
} as const;

const RECORD_INTERVAL_S = 5;
const FIT_EPOCH_S = 631065600;

export function workoutToFit(workout: Workout): Uint8Array {
  const laps = workout.rows.length > 0 ? workout.rows : [workout.summary];
  const encoder = new Encoder();
  const start = workout.startTime;
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

  write<FileIdMesg>(encoder, {
    mesgNum: MesgNum.FILE_ID,
    type: FIT.fileActivity,
    manufacturer: FIT.manufacturerDevelopment,
    product: 0,
    serialNumber: 1,
    timeCreated: start,
  });
  if (workout.dragFactor !== null) {
    const { key, developerDataId, fieldDescription } = DRAG_FACTOR_FIELD;
    encoder.addDeveloperField(key, developerDataId, fieldDescription);
    write<DeveloperDataIdMesg>(encoder, developerDataId);
    write<FieldDescriptionMesg>(encoder, fieldDescription);
  }
  write<EventMesg>(encoder, {
    mesgNum: MesgNum.EVENT,
    timestamp: start,
    event: FIT.eventTimer,
    eventType: FIT.eventTypeStart,
  });

  let elapsed = 0;
  let distance = 0;
  const lapMesgs: Encodable<LapMesg>[] = [];
  for (const [index, row] of laps.entries()) {
    const lapStart = elapsed;
    const duration = (row.durationDs ?? 0) / 10;
    const lapDistance = row.distanceM ?? 0;
    const power = powerOf(row, workout.splitDistance);

    for (let t = 0; t < duration; t += RECORD_INTERVAL_S) {
      writeRecord(encoder, at(lapStart + t), row.isRest ? distance : distance + (lapDistance * t) / duration, row, power);
    }
    elapsed += duration;
    if (!row.isRest) distance += lapDistance;
    writeRecord(encoder, at(elapsed), distance, row, power);

    lapMesgs.push({
      mesgNum: MesgNum.LAP,
      messageIndex: index,
      timestamp: at(elapsed),
      startTime: at(lapStart),
      event: FIT.eventLap,
      eventType: FIT.eventTypeStop,
      lapTrigger: FIT.lapTriggerManual,
      sport: FIT.sportRowing,
      subSport: FIT.subSportIndoorRowing,
      intensity: row.isRest ? FIT.intensityRest : FIT.intensityActive,
      totalElapsedTime: duration,
      totalTimerTime: duration,
      totalDistance: lapDistance,
      enhancedAvgSpeed: duration > 0 && lapDistance > 0 ? lapDistance / duration : undefined,
      avgCadence: row.rate ?? undefined,
      avgPower: power ?? undefined,
      avgHeartRate: row.heartRate ?? undefined,
      totalCalories: row.calories ?? undefined,
    });
  }

  const end = at(elapsed);
  write<EventMesg>(encoder, {
    mesgNum: MesgNum.EVENT,
    timestamp: end,
    event: FIT.eventTimer,
    eventType: FIT.eventTypeStopAll,
  });
  for (const lap of lapMesgs) write<LapMesg>(encoder, lap);

  const summary = workout.summary;
  const activeSeconds = laps.filter((r) => !r.isRest).reduce((a, r) => a + (r.durationDs ?? 0) / 10, 0);
  const totalDistance = summary.distanceM ?? distance;
  write<SessionMesg>(encoder, {
    mesgNum: MesgNum.SESSION,
    messageIndex: 0,
    timestamp: end,
    startTime: start,
    event: FIT.eventSession,
    eventType: FIT.eventTypeStop,
    trigger: FIT.sessionTriggerActivityEnd,
    sport: FIT.sportRowing,
    subSport: FIT.subSportIndoorRowing,
    totalElapsedTime: elapsed,
    totalTimerTime: elapsed,
    totalDistance,
    firstLapIndex: 0,
    numLaps: lapMesgs.length,
    enhancedAvgSpeed: activeSeconds > 0 && totalDistance > 0 ? totalDistance / activeSeconds : undefined,
    avgCadence: summary.rate ?? undefined,
    avgPower: powerOf(summary, workout.splitDistance) ?? undefined,
    avgHeartRate: summary.heartRate ?? undefined,
    totalCalories: summary.calories ?? undefined,
    developerFields: workout.dragFactor === null ? undefined : { [DRAG_FACTOR_FIELD.key]: workout.dragFactor },
  });
  write<ActivityMesg>(encoder, {
    mesgNum: MesgNum.ACTIVITY,
    timestamp: end,
    localTimestamp: Math.round(end.getTime() / 1000) - FIT_EPOCH_S - end.getTimezoneOffset() * 60,
    totalTimerTime: elapsed,
    numSessions: 1,
    type: FIT.activityManual,
    event: FIT.eventActivity,
    eventType: FIT.eventTypeStop,
  });

  return encoder.close();
}

function writeRecord(encoder: Encoder, timestamp: Date, distance: number, row: WorkoutRow, power: number | null): void {
  write<RecordMesg>(encoder, {
    mesgNum: MesgNum.RECORD,
    timestamp,
    distance,
    cadence: row.isRest ? 0 : (row.rate ?? undefined),
    power: row.isRest ? 0 : (power ?? undefined),
    heartRate: row.heartRate ?? undefined,
  });
}

function write<T extends Mesg>(encoder: Encoder, mesg: Encodable<T>): void {
  encoder.writeMesg(mesg);
}

function powerOf(row: WorkoutRow, splitDistance: number): number | null {
  if (row.isRest) return null;
  if (row.watts !== null) return row.watts;
  return row.splitDs ? wattsForSplit(row.splitDs, splitDistance) : null;
}
