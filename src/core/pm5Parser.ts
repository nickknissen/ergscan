import { parseTime } from './time';
import { emptyRow, splitFor, sumRows, type ExtraColumn, type WorkoutRow } from './workout';

export interface ScreenDate {
  year: number;
  month: number;
  day: number;
}

export interface ParsedScan {
  date?: ScreenDate | null;
  dragFactor: number | null;
  splitDistance: 500 | 1000;
  extraColumn: ExtraColumn | null;
  summary: WorkoutRow;
  summaryFromScreen: boolean;
  rows: WorkoutRow[];
  /** The rows as the screen showed them, before cumulative columns were turned into laps; kept to merge later photos. */
  screen: ScreenRead;
}

/** What one photo of the results screen showed, with columns still as printed (possibly cumulative). */
export interface ScreenRead {
  date: ScreenDate | null;
  dragFactor: number | null;
  splitDistance: 500 | 1000;
  extraColumn: ExtraColumn | null;
  titleRestDs: number | null;
  summary: WorkoutRow | null;
  rows: WorkoutRow[];
}

type Token = { text: string; rest: boolean };
type ParsedLine = {
  row: WorkoutRow;
  extra: number | null;
  restShaped: boolean;
  restDurationDs: number | null;
  /** Every reading of the time and pace cells when OCR left them ambiguous; the first is in the row. */
  times: number[];
  splits: number[];
  /** The time without a leading 1, which may be a rest's r. */
  restWithoutOne: number | null;
};

const OCR_DIGIT_FIXES: Record<string, string> = { O: '0', o: '0', D: '0', I: '1', l: '1', L: '1', S: '5', B: '8' };
const MIN_SPLIT_DS = 500;
const MAX_SPLIT_DS = 12000;
const MIN_HEART_RATE = 40;
const MAX_HEART_RATE = 230;
const MIN_RATE = 10;
const MAX_STROKE_RATE = 70;
/** A BikeErg shows cadence in rpm where a rower shows strokes per minute. */
const MAX_CADENCE_RPM = 150;

export function parsePm5Text(text: string): ParsedScan | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let splitDistance: 500 | 1000 = 500;
  let paceUnit: PaceUnit = 'split';
  let maxRate = MAX_STROKE_RATE;
  let headerSeen = false;
  let titleRestDs: number | null = null;
  let date: ScreenDate | null = null;
  let dragFactor: number | null = null;
  const parsed: ParsedLine[] = [];

  for (const raw of lines) {
    const drag = takeDragFactor(raw);
    if (drag) dragFactor ??= drag.value;
    const line = drag ? drag.rest : raw;
    if (!line) continue;
    // Until the rows start: text above the monitor, such as a logbook post, can look like the table header.
    const aboveRows = !headerSeen || parsed.length === 0;
    const rest = aboveRows ? /(\d{1,2}:\d{2})r\b/.exec(line) : null;
    if (rest) titleRestDs = parseTime(rest[1]!);
    if (aboveRows) date ??= readDate(line);
    const header = readHeader(line);
    if (header) {
      headerSeen = true;
      splitDistance = header.splitDistance;
      paceUnit = header.paceUnit;
      maxRate = header.maxRate;
      parsed.length = 0;
      continue;
    }
    const result = readRow(tokenize(line), paceUnit, maxRate);
    if (result) parsed.push(result);
  }

  if (parsed.length === 0) return null;

  resolveReadings(parsed, splitDistance);
  markShapedRests(parsed, titleRestDs);
  const extraColumn: ExtraColumn | null = parsed.some((p) => p.extra !== null) ? 'heartRate' : null;
  for (const p of parsed) {
    if (p.extra !== null) p.row.heartRate = p.extra;
  }

  const all = parsed.map((p) => p.row);
  const [first, ...rest] = all as [WorkoutRow, ...WorkoutRow[]];
  const read = (summary: WorkoutRow | null, rows: WorkoutRow[]): ParsedScan =>
    scanFromScreen({ date, dragFactor, splitDistance, extraColumn, titleRestDs, summary, rows });
  if (rest.length === 0) return read(first, []);
  if ((headerSeen && (!exceededBy(first, rest) || metersAddUp(first, rest))) || isSummaryOf(first, rest)) return read(first, rest);
  return read(null, all);
}

/** Turns what the screen showed into laps: cumulative columns become per-lap values and a missing total is summed. */
export function scanFromScreen(screen: ScreenRead): ParsedScan {
  const { date, dragFactor, splitDistance, extraColumn, titleRestDs } = screen;
  const rows = screen.rows.map((r) => ({ ...r }));
  decumulate(rows, 'durationDs', 10, screen.summary?.durationDs ?? null, splitDistance);
  decumulate(rows, 'distanceM', 5, screen.summary?.distanceM ?? null, splitDistance);
  const summary = screen.summary ? { ...screen.summary } : sumRows(rows, splitDistance);
  if (screen.summary) repairSummaryTime(summary, rows, splitDistance);
  for (const row of [summary, ...rows]) fillSplit(row, splitDistance);
  const withRest = titleRestDs && !rows.some((r) => r.isRest) ? interleaveRest(rows, titleRestDs) : rows;
  return { date, dragFactor, splitDistance, extraColumn, summary, summaryFromScreen: screen.summary !== null, rows: withRest, screen };
}

function repairSummaryTime(summary: WorkoutRow, rows: WorkoutRow[], splitDistance: number): void {
  const work = rows.filter((r) => !r.isRest);
  const workTime = work.reduce((a, r) => a + (r.durationDs ?? 0), 0);
  const workMeters = work.reduce((a, r) => a + (r.distanceM ?? 0), 0);
  const time = summary.durationDs;
  const meters = summary.distanceM;
  if (workTime === 0) return;

  const tooSmall = time !== null && workTime > time * 1.5;
  const lapsComplete = meters !== null && Math.abs(workMeters - meters) <= Math.max(10, meters * 0.02);
  const matchesOwnSplit = time !== null && meters && summary.splitDs !== null && Math.abs(splitFor(time, meters, splitDistance) - summary.splitDs) <= 10;
  const offFromLaps = time !== null && Math.abs(time - workTime) > Math.max(10, workTime * 0.01);
  if (tooSmall || (lapsComplete && offFromLaps && !matchesOwnSplit)) {
    summary.durationDs = workTime;
    summary.splitDs = null;
  }
}

function metersAddUp(candidate: WorkoutRow, rows: WorkoutRow[]): boolean {
  const total = candidate.distanceM;
  const work = rows.filter((r) => !r.isRest && r.distanceM !== null).map((r) => r.distanceM!);
  if (total === null || work.length === 0) return false;
  const close = (v: number) => Math.abs(v - total) <= Math.max(10, total * 0.02);
  return close(work.reduce((a, b) => a + b, 0)) || close(Math.max(...work));
}

function exceededBy(candidate: WorkoutRow, rows: WorkoutRow[]): boolean {
  const work = rows.filter((r) => !r.isRest);
  const larger = (key: 'durationDs' | 'distanceM') => {
    const own = candidate[key];
    if (own === null) return false;
    const count = work.filter((r) => r[key] !== null && r[key]! > own * 1.01 + 1).length;
    return count > 0 && count >= Math.ceil(work.length / 2);
  };
  return larger('durationDs') || larger('distanceM');
}

/** Each month's abbreviations, in English and where the monitor's Spanish or German ones differ. */
const MONTHS = [['jan', 'ene'], ['feb'], ['mar'], ['apr', 'abr'], ['may', 'mai'], ['jun'], ['jul'], ['aug', 'ago'], ['sep'], ['oct', 'okt'], ['nov'], ['dec', 'dic', 'dez']];

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

function readDate(line: string): ScreenDate | null {
  const m = /([A-Za-z]{2,4})[^A-Za-z\d]{0,2}\s+(\d{1,2}),?\s+(20\d\d)\b/.exec(line);
  if (!m) return null;
  const word = m[1]!.toLowerCase().slice(0, 3);
  const scored = MONTHS.map((names, index) => ({ index, distance: Math.min(...names.map((name) => editDistance(word, name))) })).sort(
    (a, b) => a.distance - b.distance,
  );
  const [best, second] = scored as [{ index: number; distance: number }, { index: number; distance: number }];
  if (best.distance > 1 || best.distance === second.distance) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  return { year: Number(m[3]), month: best.index + 1, day };
}

const MIN_DRAG_FACTOR = 50;
const MAX_DRAG_FACTOR = 300;

/**
 * Takes a "Drag Factor: 125" label out of a line. The value is null when it is unreadable or implausible;
 * the rest of the line is returned so a header or row OCR merged onto it still parses.
 */
function takeDragFactor(line: string): { value: number | null; rest: string } | null {
  const m = /\bdrag\s*fa[a-z]*[^\w\n]*([\dOoDIlLSB]{2,3}\b)?/i.exec(line);
  if (!m) return null;
  const rest = (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length)).trim();
  const value = m[1] === undefined ? null : Number(fixOcrDigits(m[1]));
  return { value: value !== null && value >= MIN_DRAG_FACTOR && value <= MAX_DRAG_FACTOR ? value : null, rest };
}

function fixOcrDigits(text: string): string {
  return text.replace(/[OoDIlLSB]/g, (c) => OCR_DIGIT_FIXES[c] ?? c);
}

function interleaveRest(rows: WorkoutRow[], restDs: number): WorkoutRow[] {
  return rows.flatMap((row) => [row, { ...emptyRow(), durationDs: restDs, isRest: true }]);
}

type Cell = { i: number; v: number };

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * Turns a cumulative column into laps. A split workout prints its fixed dimension (the meters of distance
 * splits, the time of time splits) as a running total, so each row is one step past the row above and only the
 * last split may be short.
 */
function decumulate(rows: WorkoutRow[], key: 'durationDs' | 'distanceM', minTolerance: number, total: number | null, splitDistance: number): void {
  const work = rows.filter((r) => !r.isRest);
  const lastIndex = work.length - 1;
  const known = work.map((r, i) => ({ i, v: r[key] })).filter((k): k is Cell => k.v !== null);
  const fit = cumulativeStep(known, lastIndex, minTolerance, total);
  if (!fit) return;
  const { step, offset } = fit;
  const tolerance = Math.max(minTolerance, step * 0.02);
  const lastValue = work[lastIndex]![key];
  const remainder = lastValue === null ? null : lastValue - step * (lastIndex + offset);
  const laps = work.map((row, i) => {
    if (i < lastIndex) return step;
    return remainder !== null && remainder > 0 && remainder <= step + tolerance ? remainder : row[key] === null ? null : step;
  });
  // Two rows are the least evidence (OCR may have lost the rows between them): where the rows show a pace,
  // the laps must agree with it.
  if (fit.twoSplits && work.some((row, i) => !paceFits({ ...row, [key]: laps[i] }, splitDistance))) return;
  work.forEach((row, i) => (row[key] = laps[i]!));
}

/** Whether a row's pace, where it has one, is its time over its meters. */
function paceFits(row: WorkoutRow, splitDistance: number): boolean {
  if (row.durationDs === null || !row.distanceM || row.splitDs === null) return true;
  return Math.abs(splitFor(row.durationDs, row.distanceM, splitDistance) - row.splitDs) <= Math.max(5, row.splitDs * 0.02);
}

/**
 * The step of a cumulative column, and how many splits the screen is scrolled past (the first row shown is
 * step × (offset + 1)); null when the column is not cumulative.
 */
function cumulativeStep(known: Cell[], lastIndex: number, minTolerance: number, total: number | null): { step: number; offset: number; twoSplits?: true } | null {
  const middle = known.filter((k) => k.i < lastIndex);
  const last = known.find((k) => k.i === lastIndex);
  // Two splits: the second ends at the total.
  if (lastIndex === 1 && middle.length === 1 && last && total !== null && Math.abs(last.v - total) <= minTolerance && middle[0]!.v < last.v) {
    return { step: middle[0]!.v, offset: 0, twoSplits: true };
  }
  if (known.length < 3 || middle.length < 2) return null;
  const fromFirst = stepFitting(middle, 0, minTolerance);
  if (fromFirst !== null) return { step: fromFirst, offset: 0 };

  // Scrolled past the first splits. Only when the column runs past the total if summed, as a running total
  // does, so a ladder of interval distances is not taken for one, and climbs a sizeable step every row, so
  // per-split values under a misread total are not either.
  if (total === null || Math.max(...known.map((k) => k.v)) > total + minTolerance) return null;
  if (known.reduce((a, k) => a + k.v, 0) <= total * 1.01 + minTolerance) return null;
  const gaps = middle.slice(1).map((k, j) => (k.v - middle[j]!.v) / (k.i - middle[j]!.i));
  const gap = median(gaps);
  const gapTolerance = Math.max(minTolerance, gap * 0.02);
  if (gap < 10 * minTolerance || gaps.some((g) => g <= 0)) return null;
  if (gaps.filter((g) => Math.abs(g - gap) <= gapTolerance).length < Math.ceil(gaps.length * 0.6)) return null;
  const offset = Math.round(median(middle.map((k) => k.v / gap - (k.i + 1))));
  if (offset < 1) return null;
  const step = stepFitting(middle, offset, minTolerance);
  return step === null ? null : { step, offset };
}

/** The step most rows above the last fit when the first row shown is split offset + 1, or null. */
function stepFitting(middle: Cell[], offset: number, minTolerance: number): number | null {
  const step = Math.round(median(middle.map((k) => k.v / (k.i + 1 + offset))));
  if (step <= 0) return null;
  const tolerance = Math.max(minTolerance, step * 0.02);
  const consistent = middle.filter((k) => Math.abs(k.v - step * (k.i + 1 + offset)) <= tolerance * (k.i + 1 + offset)).length;
  return consistent >= Math.max(2, Math.ceil(middle.length * 0.6)) ? step : null;
}

type PaceUnit = 'split' | 'watts' | 'calPerHour';

function readHeader(line: string): { splitDistance: 500 | 1000; paceUnit: PaceUnit; maxRate: number } | null {
  const lower = line.toLowerCase();
  const isHeader = /meter|s\/m|\/\s*[15]000?\s*m/.test(lower) || (/\btime\b/.test(lower) && !/\d:\d/.test(lower));
  if (!isHeader) return null;
  const splitDistance = /\/\s*1000/.test(lower) ? 1000 : 500;
  const paceUnit: PaceUnit = /watt/.test(lower) ? 'watts' : /cal/.test(lower) ? 'calPerHour' : 'split';
  const maxRate = /\brpm\b/.test(lower) ? MAX_CADENCE_RPM : MAX_STROKE_RATE;
  return { splitDistance, paceUnit, maxRate };
}

function tokenize(line: string): Token[] {
  return line
    .replace(/[ãõóòöøÓÒÖØü]/g, 'o')
    .replace(/(\d)±(\d)/g, '$1:$2')
    .replace(/[|[\]{}()!©®“”‘’"`~<>_—–]/g, ' ')
    .replace(/(\d),(\d)(?!\d)/g, '$1.$2')
    .replace(/(\d+:\d{2})\.\s+(\d)\b/g, '$1.$2')
    .replace(/(\d+:\d{2})\s+\.(\d)\b/g, '$1.$2')
    .split(/\s+/)
    .map(cleanToken)
    .filter((t) => /\d/.test(t.text));
}

function cleanToken(piece: string): Token {
  let text = piece.replace(/^[^\w:.,]+|[^\w:.,]+$/g, '');
  const rest = /^[rR]/.test(text);
  if (rest) text = text.slice(1);
  if (!/\d/.test(text)) return { text, rest };
  text = fixOcrDigits(text)
    .replace(/(\d)[i;](\d)/g, '$1:$2')
    .replace(/[A-Za-z]+$/, '')
    .replace(/^(\d{1,2})\.(\d{2})\.(\d)$/, '$1:$2.$3')
    .replace(/^((?:\d{1,2}:)?\d{1,2}:\d{2}\.\d)\d+$/, '$1');
  return { text, rest };
}

function asInt(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) return Number(text.replace(/[.,]/g, ''));
  return null;
}

function splitMergedRateAndExtra(value: number): { rate: number; extra: number } | null {
  const digits = String(value);
  if (digits.length < 4 || digits.length > 6) return null;
  const rate = Number(digits.slice(0, 2));
  const extra = Number(digits.slice(2, 5));
  return rate >= 10 && rate <= 70 && extra >= 40 && extra <= 230 ? { rate, extra } : null;
}

function asTime(text: string, allowWholeSeconds: boolean): number | null {
  if (/^\d{0,2}(:\d{2}){1,2}(\.\d)?$/.test(text)) return parseTime(text);
  if (!/^[\d:.]+$/.test(text)) return null;
  const d = text.replace(/\D/g, '');
  switch (d.length) {
    case 3:
      return allowWholeSeconds ? parseTime(`${d[0]}:${d.slice(1)}`) : null;
    case 4:
      return parseTime(`${d[0]}:${d.slice(1, 3)}.${d[3]}`);
    case 5:
      return parseTime(`${d.slice(0, 2)}:${d.slice(2, 4)}.${d[4]}`);
    case 6:
      return parseTime(`${d[0]}:${d.slice(1, 3)}:${d.slice(3, 5)}.${d[5]}`);
    default:
      return null;
  }
}

/**
 * Readings of a time whose colon OCR saw as a 1: `147.5` may be `:47.5`, `6149.1` may be `6:49.1` and `1128:05.1`
 * may be `1:28:05.1`.
 */
function colonReadAsOne(text: string): number[] {
  const readings = [
    /^(\d{0,2})1(\d{2}\.\d)$/.exec(text),
    /^(\d)1(\d{2}:\d{2}\.\d)$/.exec(text),
    /^(\d:\d{2})1(\d{2}\.\d)$/.exec(text),
  ].map((m) => (m ? parseTime(`${m[1]}:${m[2]}`) : null));
  return readings.filter((v): v is number => v !== null);
}

/** Every distinct reading of a time cell, the plain one first. */
function timeReadings(text: string, allowWholeSeconds: boolean): number[] {
  const all = [asTime(text, allowWholeSeconds), ...colonReadAsOne(text)].filter((v): v is number => v !== null);
  return [...new Set(all)];
}

const isSplit = (ds: number) => ds >= MIN_SPLIT_DS && ds <= MAX_SPLIT_DS;

function readRow(tokens: Token[], paceUnit: PaceUnit, maxRate: number): ParsedLine | null {
  const [first, ...others] = tokens;
  if (!first) return null;
  const row = emptyRow();
  row.isRest = first.rest || Boolean(others[0]?.rest);

  if (first.rest && asInt(first.text) !== null && others.length === 0) {
    row.distanceM = asInt(first.text);
    return { row, extra: null, restShaped: false, restDurationDs: null, times: [], splits: [], restWithoutOne: null };
  }
  const times = timeReadings(first.text, true);
  let splits: number[] = [];
  row.durationDs = times[0] ?? null;
  const unreadableTime = /[:.%]/.test(first.text) && others.length >= 2;
  if (row.durationDs === null && !unreadableTime) return null;

  let extra: number | null = null;
  let stage = 1;
  for (const t of others) {
    const int = asInt(t.text);
    // Meters run into the pace: `100002:06.4`.
    const joined = stage <= 1 && paceUnit === 'split' ? /^(\d{2,6})(\d:\d{2}\.\d)$/.exec(t.text) : null;
    const joinedSplit = joined ? parseTime(joined[2]!) : null;
    if (joinedSplit !== null && isSplit(joinedSplit)) {
      row.distanceM = Number(joined![1]);
      row.splitDs = joinedSplit;
      stage = 3;
      continue;
    }
    if (stage <= 1 && int !== null) {
      row.distanceM = int;
      stage = 2;
      continue;
    }
    if (stage === 2 && paceUnit !== 'split' && int !== null) {
      if (paceUnit === 'watts') row.watts = int;
      stage = 3;
      continue;
    }
    const readings = stage <= 2 && paceUnit === 'split' ? timeReadings(t.text, false).filter(isSplit) : [];
    if (readings.length) {
      row.splitDs = readings[0]!;
      splits = readings;
      stage = 3;
    } else if (stage <= 3 && int !== null && int >= MIN_RATE && int <= maxRate) {
      row.rate = int;
      stage = 4;
    } else if (stage <= 3 && int !== null && splitMergedRateAndExtra(int)) {
      const merged = splitMergedRateAndExtra(int)!;
      row.rate = merged.rate;
      extra = merged.extra;
      stage = 5;
    } else if (stage >= 2 && stage <= 4 && int !== null) {
      const heartRate = int >= 1000 && int < 10000 ? Math.floor(int / 10) : int;
      if (heartRate >= MIN_HEART_RATE && heartRate <= MAX_HEART_RATE) extra = heartRate;
      stage = 5;
    }
  }

  if (row.isRest) {
    row.splitDs = null;
    row.rate = null;
    extra = null;
  } else if (row.distanceM === null && row.splitDs === null && row.rate === null) {
    return null;
  }

  const restShaped = !row.isRest && others.length === 1 && row.distanceM !== null;
  const stripped = /^[7fFtT]\d/.test(first.text) ? asTime(first.text.slice(1), true) : null;
  const restWithoutOne = /^1\d/.test(first.text) ? asTime(first.text.slice(1), true) : null;
  return { row, extra, restShaped, restDurationDs: stripped ?? row.durationDs, times, splits, restWithoutOne };
}

/**
 * Where OCR left a time or pace with more than one reading, keeps the one that pace = time / distance supports.
 * Meters and times may be cumulative on the screen, so the step from the row above counts too.
 */
function resolveReadings(lines: ParsedLine[], splitDistance: number): void {
  let above: WorkoutRow | null = null;
  for (const { row, times, splits } of lines) {
    if (row.isRest) continue;
    if (times.length > 1 || splits.length > 1) {
      const fits = (time: number | null, split: number | null) => time !== null && split !== null && agrees(time, split, row, above, splitDistance);
      if (!fits(row.durationDs, row.splitDs)) {
        const candidates = (times.length ? times : [row.durationDs]).flatMap((time) => (splits.length ? splits : [row.splitDs]).map((split) => [time, split] as const));
        const pair = candidates.find(([time, split]) => fits(time, split));
        if (pair) [row.durationDs, row.splitDs] = pair;
      }
    }
    above = row;
  }
}

function agrees(time: number, split: number, row: WorkoutRow, above: WorkoutRow | null, splitDistance: number): boolean {
  const times = [time];
  if (above?.durationDs != null && time > above.durationDs) times.push(time - above.durationDs);
  const meters = row.distanceM ? [row.distanceM] : [];
  if (row.distanceM && above?.distanceM != null && row.distanceM > above.distanceM) meters.push(row.distanceM - above.distanceM);
  return times.some((t) => meters.some((m) => Math.abs(splitFor(t, m, splitDistance) - split) <= Math.max(5, split * 0.02)));
}

/**
 * Marks rows shaped like a rest (a time and a few meters) as rests. A rest's r read as a 1 (`12:00.0` for
 * `r2:00.0`) is dropped when the time without it is the rest time the title or another rest row shows.
 */
function markShapedRests(lines: ParsedLine[], titleRestDs: number | null): void {
  const work = lines.filter((l) => !l.restShaped && !l.row.isRest && l.row.splitDs !== null && l.row.distanceM !== null);
  if (work.length === 0) return;
  const distances = work.map((l) => l.row.distanceM!).sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)]!;
  const knownRests = new Set([titleRestDs, ...lines.filter((l) => l.row.isRest).map((l) => l.row.durationDs)]);
  for (const line of lines) {
    if (!line.restShaped || line.row.distanceM! >= median * 0.3) continue;
    line.row.isRest = true;
    const withoutOne = line.restWithoutOne !== null && knownRests.has(line.restWithoutOne) && !knownRests.has(line.restDurationDs);
    line.row.durationDs = withoutOne ? line.restWithoutOne : line.restDurationDs;
  }
}

function fillSplit(row: WorkoutRow, splitDistance: number): void {
  if (row.isRest || row.splitDs !== null) return;
  if (row.durationDs && row.distanceM) row.splitDs = splitFor(row.durationDs, row.distanceM, splitDistance);
}

function isSummaryOf(candidate: WorkoutRow, rows: WorkoutRow[]): boolean {
  const active = rows.filter((r) => !r.isRest);
  const distance = active.reduce((a, r) => a + (r.distanceM ?? 0), 0);
  const duration = active.reduce((a, r) => a + (r.durationDs ?? 0), 0);
  const checks: boolean[] = [];
  if (candidate.distanceM !== null && distance > 0) {
    checks.push(Math.abs(candidate.distanceM - distance) <= Math.max(10, distance * 0.02));
  }
  if (candidate.durationDs !== null && duration > 0) {
    checks.push(Math.abs(candidate.durationDs - duration) <= Math.max(10, duration * 0.01));
  }
  return checks.length > 0 && checks.every(Boolean);
}
