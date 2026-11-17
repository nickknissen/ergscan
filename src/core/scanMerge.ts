import { scanFromScreen, type ParsedScan } from './pm5Parser';
import type { Workout, WorkoutRow } from './workout';

/** Shared rows must agree on at least this many of time, meters and split. */
const MIN_AGREEING_CELLS = 2;
/** Gaps the monitor's own rounding can leave between the laps and the total. */
const ROUNDING_M = 5;
const ROUNDING_DS = 10;

/**
 * Adds the rows of another photo of the same results screen, scrolled up or down, to an earlier scan.
 * The total and workout details come from the first photo; rows the two photos share are kept once,
 * and the photo whose rows come first on the monitor goes first.
 */
export function mergeScans(first: ParsedScan, next: ParsedScan): ParsedScan {
  const a = first.screen;
  const b = next.screen;
  const below = overlapLength(a.rows, b.rows);
  const above = overlapLength(b.rows, a.rows);
  const rows = above > below ? [...b.rows, ...a.rows.slice(above)] : [...a.rows, ...b.rows.slice(below)];
  return scanFromScreen({
    date: a.date ?? b.date,
    dragFactor: a.dragFactor ?? b.dragFactor,
    splitDistance: a.splitDistance,
    extraColumn: a.extraColumn ?? b.extraColumn,
    titleRestDs: a.titleRestDs ?? b.titleRestDs,
    summary: a.summary ?? b.summary,
    rows,
  });
}

type Laps = Pick<Workout, 'summary' | 'rows'>;

/**
 * The workout's total and laps after another photo was merged. While the workout is still as scanned it
 * takes the merged result; once the user edited it, their total and rows stay and only the new laps are added.
 */
export function withAddedRows(current: Laps, previous: ParsedScan, merged: ParsedScan): Laps {
  const untouched = JSON.stringify(current) === JSON.stringify({ summary: previous.summary, rows: previous.rows });
  if (untouched) return { summary: merged.summary, rows: merged.rows };
  return { summary: current.summary, rows: [...current.rows, ...merged.rows.slice(previous.rows.length)] };
}

/**
 * True when the screen showed a total and the work laps fall short of it in meters or time,
 * which means rows were scrolled off screen and another photo can add them.
 */
export function rowsMissing(scan: Pick<ParsedScan, 'summaryFromScreen' | 'summary' | 'rows'>): boolean {
  if (!scan.summaryFromScreen) return false;
  const work = scan.rows.filter((r) => !r.isRest);
  const short = (total: number | null, key: 'distanceM' | 'durationDs', rounding: number) => {
    if (total === null) return false;
    return total - work.reduce((a, r) => a + (r[key] ?? 0), 0) > rounding;
  };
  return short(scan.summary.distanceM, 'distanceM', ROUNDING_M) || short(scan.summary.durationDs, 'durationDs', ROUNDING_DS);
}

/** The most rows at the start of `next` that repeat the last rows of `rows`. */
function overlapLength(rows: WorkoutRow[], next: WorkoutRow[]): number {
  for (let k = Math.min(rows.length, next.length); k > 0; k--) {
    const tail = rows.slice(rows.length - k);
    if (tail.every((row, i) => sameRow(row, next[i]!))) return k;
  }
  return 0;
}

/** Same time, meters and split as printed; a cell OCR could not read on one photo does not count against a match. */
function sameRow(a: WorkoutRow, b: WorkoutRow): boolean {
  if (a.isRest !== b.isRest) return false;
  let agreed = 0;
  for (const key of ['durationDs', 'distanceM', 'splitDs'] as const) {
    if (a[key] === null || b[key] === null) continue;
    if (a[key] !== b[key]) return false;
    agreed++;
  }
  return agreed >= MIN_AGREEING_CELLS;
}
