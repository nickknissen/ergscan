import type { ParsedScan } from './pm5Parser';
import { splitFor, type WorkoutRow } from './workout';

const MIN_RATE = 12;
const MAX_RATE = 50;

/** Whether the work rows add up to the on-screen summary, in time and in meters. */
function sums(scan: ParsedScan): { time: boolean; meters: boolean } {
  const work = scan.rows.filter((r) => !r.isRest);
  const { durationDs, distanceM } = scan.summary;
  const time = work.reduce((a, r) => a + (r.durationDs ?? 0), 0);
  const meters = work.reduce((a, r) => a + (r.distanceM ?? 0), 0);
  return {
    time: durationDs !== null && Math.abs(time - durationDs) <= Math.max(10, durationDs * 0.01),
    meters: distanceM !== null && Math.abs(meters - distanceM) <= Math.max(10, distanceM * 0.02),
  };
}

/** True when the summary came from the screen and the splits add up to it in both time and meters. */
export function addsUp(scan: ParsedScan | null): boolean {
  if (!scan || !scan.summaryFromScreen || scan.rows.length === 0) return false;
  const s = sums(scan);
  return s.time && s.meters;
}

function splitAgrees(durationDs: number | null, meters: number | null, splitDs: number | null, splitDistance: number): boolean {
  if (!durationDs || !meters || !splitDs) return false;
  return Math.abs(splitFor(durationDs, meters, splitDistance) - splitDs) <= 2;
}

const plausibleRate = (rate: number | null) => rate !== null && rate >= MIN_RATE && rate <= MAX_RATE;

/** Meters each row covers: the step from the previous row when a scrolled screen shows cumulative meters. */
function rowMeters(rows: WorkoutRow[]): (number | null)[] {
  const d = rows.map((r) => r.distanceM);
  const rising = d.slice(1).filter((v, i) => v !== null && d[i] !== null && v > d[i]!).length;
  if (d.length < 3 || rising < (d.length - 1) * 0.6) return d;
  const steps = d.map((v, i) => (i > 0 && v !== null && d[i - 1] !== null ? v - d[i - 1]! : null));
  const known = steps.filter((s): s is number => s !== null && s > 0).sort((a, b) => a - b);
  steps[0] = known[Math.floor(known.length / 2)] ?? null;
  return steps;
}

/**
 * Roughly how many fields of a read can be trusted, judged from the read alone:
 * rows whose split agrees with their time and meters, plausible stroke rates,
 * a summary that agrees with itself and with its rows, and a date.
 * Used to pick the better of two reads of the same photo.
 */
export function scanTrust(scan: ParsedScan | null): number {
  if (!scan) return -1;
  const sd = scan.splitDistance;
  const meters = rowMeters(scan.rows);
  let score = 0;
  scan.rows.forEach((r, i) => {
    score += 0.5;
    if (r.isRest) return;
    if (splitAgrees(r.durationDs, meters[i]!, r.splitDs, sd)) score += 2;
    if (plausibleRate(r.rate)) score += 1;
  });
  if (scan.summaryFromScreen) {
    const { summary } = scan;
    const s = sums(scan);
    if (splitAgrees(summary.durationDs, summary.distanceM, summary.splitDs, sd) && (summary.rate === null || plausibleRate(summary.rate))) score += 2;
    if (s.time) score += 1;
    if (s.meters) score += 1;
  }
  if (scan.date) score += 1;
  return score;
}
