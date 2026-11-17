import { scanFromScreen, type ParsedScan } from './pm5Parser';
import type { WorkoutRow } from './workout';

/**
 * Adds the rows of a later photo of the same results screen, scrolled further down, to an earlier scan.
 * The total and workout details come from the first photo; rows the two photos share are kept once.
 */
export function mergeScans(first: ParsedScan, next: ParsedScan): ParsedScan {
  const a = first.screen;
  const b = next.screen;
  return scanFromScreen({
    date: a.date ?? b.date,
    dragFactor: a.dragFactor ?? b.dragFactor,
    splitDistance: a.splitDistance,
    extraColumn: a.extraColumn ?? b.extraColumn,
    titleRestDs: a.titleRestDs ?? b.titleRestDs,
    summary: a.summary ?? b.summary,
    rows: [...a.rows, ...b.rows.slice(overlapLength(a.rows, b.rows))],
  });
}

/**
 * True when the screen showed a total and the work laps fall short of it in meters or time,
 * which means rows were scrolled off screen and another photo can add them.
 */
export function rowsMissing(scan: ParsedScan): boolean {
  if (!scan.summaryFromScreen) return false;
  const work = scan.rows.filter((r) => !r.isRest);
  const short = (total: number | null, key: 'distanceM' | 'durationDs', share: number) => {
    if (total === null) return false;
    const laps = work.reduce((a, r) => a + (r[key] ?? 0), 0);
    return total - laps > Math.max(10, total * share);
  };
  return short(scan.summary.distanceM, 'distanceM', 0.02) || short(scan.summary.durationDs, 'durationDs', 0.01);
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
  return agreed >= 2;
}
