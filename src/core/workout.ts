export type ExtraColumn = 'heartRate' | 'watts' | 'calories';

export interface WorkoutRow {
  durationDs: number | null;
  distanceM: number | null;
  splitDs: number | null;
  rate: number | null;
  heartRate: number | null;
  watts: number | null;
  calories: number | null;
  isRest: boolean;
}

export interface Workout {
  startTime: Date;
  splitDistance: 500 | 1000;
  summary: WorkoutRow;
  rows: WorkoutRow[];
}

export function emptyRow(): WorkoutRow {
  return {
    durationDs: null,
    distanceM: null,
    splitDs: null,
    rate: null,
    heartRate: null,
    watts: null,
    calories: null,
    isRest: false,
  };
}

export function isExportable(workout: Workout | null, invalidCells: number): boolean {
  return Boolean(workout?.summary.durationDs && workout.summary.distanceM) && invalidCells === 0;
}

export function isBlank(workout: Workout): boolean {
  const { isRest: _, ...summary } = workout.summary;
  return workout.rows.length === 0 && Object.values(summary).every((v) => v === null);
}

export function splitFor(durationDs: number, distanceM: number, splitDistance: number): number {
  return Math.round((durationDs / distanceM) * splitDistance);
}

export function wattsForSplit(splitDs: number, splitDistance: number): number {
  const secondsPerMeter = splitDs / 10 / splitDistance;
  return Math.round(2.8 / secondsPerMeter ** 3);
}

export function sumRows(rows: WorkoutRow[], splitDistance: number): WorkoutRow {
  const active = rows.filter((r) => !r.isRest);
  const total = emptyRow();
  total.durationDs = sumOf(active, 'durationDs');
  total.distanceM = sumOf(active, 'distanceM');
  if (total.durationDs && total.distanceM) {
    total.splitDs = splitFor(total.durationDs, total.distanceM, splitDistance);
  }
  total.rate = weightedAverage(active, 'rate');
  total.heartRate = weightedAverage(active, 'heartRate');
  total.watts = weightedAverage(active, 'watts');
  total.calories = sumOf(active, 'calories');
  return total;
}

export function moveExtraColumn(workout: Workout, from: ExtraColumn, to: ExtraColumn): void {
  if (from === to) return;
  for (const row of [workout.summary, ...workout.rows]) {
    row[to] = row[from];
    row[from] = null;
  }
}

type NumericKey = Exclude<keyof WorkoutRow, 'isRest'>;

function sumOf(rows: WorkoutRow[], key: NumericKey): number | null {
  const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

function weightedAverage(rows: WorkoutRow[], key: NumericKey): number | null {
  let weighted = 0;
  let weight = 0;
  for (const r of rows) {
    const v = r[key];
    if (v === null) continue;
    const w = r.durationDs ?? 1;
    weighted += v * w;
    weight += w;
  }
  return weight === 0 ? null : Math.round(weighted / weight);
}
