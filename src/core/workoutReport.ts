import type { HistoryEntry } from './history';
import { formatTime } from './time';
import { spans } from './watchHeartRate';
import { splitFor, wattsForSplit, type WorkoutRow } from './workout';
import { suggestName } from './workoutName';

/**
 * Saved workouts as plain JSON for agents, e.g. through the MCP server. Units are in the field
 * names, pace is always per 500 m, times are local with their UTC offset, and anything the
 * workout does not have is left out rather than null.
 */

/** Days are `YYYY-MM-DD` in the report's time zone, both inclusive. */
export interface WorkoutFilter {
  since?: string;
  until?: string;
  limit?: number;
}

type Report = Record<string, unknown>;

export const DEFAULT_LIMIT = 50;

/** The workouts that match, newest first, and how many matched before the limit. */
export function listWorkouts(entries: readonly HistoryEntry[], filter: WorkoutFilter, timeZone: string) {
  const matching = entries
    .filter((entry) => {
      const day = localIso(entry.workout.startTime, timeZone).slice(0, 10);
      return (!filter.since || day >= filter.since) && (!filter.until || day <= filter.until);
    })
    .sort((a, b) => b.workout.startTime.getTime() - a.workout.startTime.getTime());
  const workouts = matching.slice(0, filter.limit ?? DEFAULT_LIMIT).map((entry) => workoutSummary(entry, timeZone));
  return { total: matching.length, workouts };
}

/** One workout's totals, feeling and notes. */
export function workoutSummary(entry: HistoryEntry, timeZone: string): Report {
  const { workout } = entry;
  const series = workout.heartRates ?? [];
  const copy = entry.id.indexOf('~');
  return compact({
    id: entry.id,
    start: localIso(workout.startTime, timeZone),
    name: workout.name,
    structure: suggestName(workout),
    intervals: workout.rows.some((row) => row.isRest),
    ...rowReport(workout.summary, workout.splitDistance),
    heartRateMax: maxOf(series, 0, series.length),
    dragFactor: workout.dragFactor,
    feeling: workout.feeling,
    notes: workout.notes || null,
    watchHeartRate: series.some((value) => value !== null),
    conflictCopyOf: copy > 0 ? entry.id.slice(0, copy) : null,
  });
}

/**
 * The summary with every split or interval, rest included. With `heartRateEverySec`, also the
 * watch heart rate averaged over windows of that many seconds from the start.
 */
export function workoutDetail(entry: HistoryEntry, timeZone: string, heartRateEverySec?: number): Report {
  const { workout } = entry;
  const series = workout.heartRates;
  const splits = workout.rows.length === 0 ? [] : spans(workout).map(({ row, from, to }, index) => compact({
    number: index + 1,
    rest: row.isRest,
    ...rowReport(row, workout.splitDistance),
    heartRateMax: series ? maxOf(series, from, to) : null,
  }));
  const report: Report = { ...workoutSummary(entry, timeZone), splitDistanceM: workout.splitDistance, splits };
  if (heartRateEverySec && series?.some((value) => value !== null)) {
    report.heartRateTrace = { everySec: heartRateEverySec, bpm: windows(series, heartRateEverySec) };
  }
  return report;
}

function rowReport(row: WorkoutRow, splitDistance: number): Report {
  const { durationDs, distanceM, isRest } = row;
  let paceDs = row.splitDs === null ? null : (row.splitDs * 500) / splitDistance;
  if (paceDs === null && !isRest && durationDs && distanceM) paceDs = splitFor(durationDs, distanceM, 500);
  return {
    timeSec: durationDs === null ? null : durationDs / 10,
    time: durationDs === null ? null : formatTime(durationDs),
    distanceM,
    paceSecPer500: paceDs === null ? null : Math.round(paceDs) / 10,
    pacePer500: paceDs === null ? null : formatTime(paceDs),
    watts: row.watts ?? (paceDs !== null && !isRest ? wattsForSplit(Math.round(paceDs), 500) : null),
    strokeRate: row.rate,
    heartRate: row.heartRate,
    calories: row.calories,
  };
}

function maxOf(series: readonly (number | null)[], from: number, to: number): number | null {
  let max: number | null = null;
  for (let i = from; i < to && i < series.length; i++) {
    const value = series[i];
    if (value != null && (max === null || value > max)) max = value;
  }
  return max;
}

function windows(series: readonly (number | null)[], size: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let from = 0; from < series.length; from += size) {
    const values = series.slice(from, from + size).filter((value): value is number => value !== null);
    out.push(values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);
  }
  return out;
}

function compact(report: Report): Report {
  return Object.fromEntries(Object.entries(report).filter(([, value]) => value !== null && value !== undefined));
}

/** The time on the wall clock in `timeZone`, with its offset: 2026-11-20T18:05:12+01:00. */
export function localIso(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
  const { year, month, day, hour, minute, second } = parts;
  const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offset = Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const abs = Math.abs(offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
