import type { ParsedScan } from '../src/core/pm5Parser';
import { parseTime } from '../src/core/time';
import type { WorkoutRow } from '../src/core/workout';
import type { FactLap, Facts } from './facts';

export interface OcrScore {
  cells: number;
  cellsTotal: number;
  rows: number;
  rowsTotal: number;
  /**
   * Rows whose digits are all there, in order, on one line, when a colon may be read as 1, ;, ±, a point or
   * nothing, a point as a comma, a colon or nothing, and the spacing may differ: what a parser that knows the
   * column formats could still recover.
   */
  digitRows: number;
}

const escapeRegExp = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function forgivingRow(row: string[]): RegExp {
  const cell = (text: string) => [...text].map((c) => (c === ':' ? '\\s?[:;1i±.]?\\s?' : c === '.' ? '\\s?[.,:]?\\s?' : escapeRegExp(c))).join('');
  return new RegExp(`(^|[^\\d])${row.map(cell).join('\\s*')}([^\\d]|$)`);
}

export interface WorkoutScore {
  fields: number;
  fieldsTotal: number;
  laps: number;
  lapsExpected: number;
}

export function scoreOcr(text: string, screenRows: string[][]): OcrScore {
  const bag = new Map<string, number>();
  for (const token of text.replace(/[|[\]{}()]/g, ' ').split(/\s+/)) bag.set(token, (bag.get(token) ?? 0) + 1);
  let cells = 0;
  for (const cell of screenRows.flat()) {
    const n = bag.get(cell) ?? 0;
    if (n > 0) {
      cells++;
      bag.set(cell, n - 1);
    }
  }
  const lines = text.split('\n').map((l) => ` ${l.replace(/[|[\]{}]/g, ' ').replace(/\s+/g, ' ').trim()} `);
  const rows = screenRows.filter((r) => lines.some((l) => l.includes(` ${r.join(' ')} `))).length;
  const digitRows = screenRows.filter((r) => lines.some((l) => forgivingRow(r).test(l))).length;
  return { cells, cellsTotal: screenRows.flat().length, rows, rowsTotal: screenRows.length, digitRows };
}

export function scoreWorkout(scan: Pick<ParsedScan, 'date' | 'summary' | 'rows'> | null, workout: Facts['workout']): WorkoutScore {
  const checks: boolean[] = [];
  const { summary, laps } = workout;
  const s = scan?.summary;
  checks.push(s?.durationDs === parseTime(summary.time));
  checks.push(s?.distanceM === summary.meters);
  checks.push(s?.rate === summary.rate);
  if (summary.heartRate !== undefined) checks.push(s?.heartRate === summary.heartRate);
  const d = scan?.date;
  checks.push(d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` === workout.date : false);

  laps.forEach((lap, i) => checks.push(...lapChecks(lap, scan?.rows[i])));
  return {
    fields: checks.filter(Boolean).length,
    fieldsTotal: checks.length,
    laps: scan?.rows.length ?? 0,
    lapsExpected: laps.length,
  };
}

function lapChecks(lap: FactLap, row: WorkoutRow | undefined): boolean[] {
  const checks = [row?.durationDs === parseTime(lap.time), row?.isRest === (lap.rest ?? false)];
  if (lap.meters !== undefined) checks.push(row?.distanceM === lap.meters);
  if (lap.rate !== undefined) checks.push(row?.rate === lap.rate);
  if (lap.heartRate !== undefined) checks.push(row?.heartRate === lap.heartRate);
  return checks;
}
