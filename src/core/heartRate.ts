import type { Workout, WorkoutRow } from './workout';

const ZONE_BOUNDARY_PERCENTS = [60, 70, 80, 90] as const;
const ZONE_COUNT = ZONE_BOUNDARY_PERCENTS.length + 1;

type Timed = WorkoutRow & { heartRate: number; durationDs: number };

/** Time in each zone in tenths of a second: every recorded second when there is a watch series, else each work split's average. */
export function heartRateZones(workout: Workout, maxHr: number): number[] {
  const series = workout.heartRates?.filter((v): v is number => v !== null) ?? [];
  if (series.length > 0) {
    const zones = Array.from({ length: ZONE_COUNT }, () => 0);
    for (const heartRate of series) zones[zoneIndex(heartRate, maxHr)]! += 10;
    return zones;
  }
  const timed = (r: WorkoutRow): r is Timed => !r.isRest && r.heartRate !== null && r.durationDs !== null;
  const splits = workout.rows.filter(timed);
  const parts = splits.length > 0 ? splits : [workout.summary].filter(timed);
  const zones = Array.from({ length: ZONE_COUNT }, () => 0);
  return zones.map((_, zone) => parts.filter((r) => zoneIndex(r.heartRate, maxHr) === zone).reduce((sum, r) => sum + r.durationDs, 0));
}

function zoneIndex(heartRate: number, maxHr: number): number {
  const percent = (heartRate / maxHr) * 100;
  return ZONE_BOUNDARY_PERCENTS.filter((boundary) => percent >= boundary).length;
}
