import { parseTime } from './time';
import { emptyRow, splitFor, sumRows, type ExtraColumn, type WorkoutRow } from './workout';

export interface ParsedScan {
  splitDistance: 500 | 1000;
  extraColumn: ExtraColumn | null;
  summary: WorkoutRow;
  summaryFromScreen: boolean;
  rows: WorkoutRow[];
}

type Token = { text: string; rest: boolean };
type ParsedLine = { row: WorkoutRow; extra: number | null; restShaped: boolean; restDurationDs: number | null };

const OCR_DIGIT_FIXES: Record<string, string> = { O: '0', o: '0', D: '0', I: '1', l: '1', L: '1', S: '5', B: '8' };
const MIN_SPLIT_DS = 500;
const MAX_SPLIT_DS = 12000;

export function parsePm5Text(text: string): ParsedScan | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let splitDistance: 500 | 1000 = 500;
  let extraColumn: ExtraColumn | null = null;
  let headerSeen = false;
  const parsed: ParsedLine[] = [];

  for (const line of lines) {
    const header = readHeader(line);
    if (header) {
      headerSeen = true;
      splitDistance = header.splitDistance;
      extraColumn = header.extraColumn;
      continue;
    }
    const result = readRow(tokenize(line));
    if (result) parsed.push(result);
  }

  if (parsed.length === 0) return null;

  markShapedRests(parsed);
  if (!extraColumn && parsed.some((p) => p.extra !== null)) extraColumn = 'heartRate';
  for (const p of parsed) {
    if (p.extra !== null && extraColumn) p.row[extraColumn] = p.extra;
    fillSplit(p.row, splitDistance);
  }

  const all = parsed.map((p) => p.row);
  const [first, ...rest] = all as [WorkoutRow, ...WorkoutRow[]];
  if (rest.length === 0) {
    return { splitDistance, extraColumn, summary: first, summaryFromScreen: true, rows: [] };
  }
  if (headerSeen || isSummaryOf(first, rest)) {
    return { splitDistance, extraColumn, summary: first, summaryFromScreen: true, rows: rest };
  }
  return { splitDistance, extraColumn, summary: sumRows(all, splitDistance), summaryFromScreen: false, rows: all };
}

function readHeader(line: string): { splitDistance: 500 | 1000; extraColumn: ExtraColumn | null } | null {
  const lower = line.toLowerCase();
  const isHeader = /meter|s\/m|\/\s*[15]000?\s*m/.test(lower) || (/\btime\b/.test(lower) && !/\d:\d/.test(lower));
  if (!isHeader) return null;
  const splitDistance = /\/\s*1000\s*m/.test(lower) ? 1000 : 500;
  let extraColumn: ExtraColumn | null = null;
  if (/watt/.test(lower)) extraColumn = 'watts';
  else if (/cal/.test(lower)) extraColumn = 'calories';
  else if (/[♡♥]|\bhr\b|bpm/.test(lower)) extraColumn = 'heartRate';
  return { splitDistance, extraColumn };
}

function tokenize(line: string): Token[] {
  return line
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
  text = text
    .replace(/[OoDIlLSB]/g, (c) => OCR_DIGIT_FIXES[c] ?? c)
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

function readRow(tokens: Token[]): ParsedLine | null {
  const [first, ...others] = tokens;
  if (!first) return null;
  const row = emptyRow();
  row.isRest = first.rest || Boolean(others[0]?.rest);

  if (first.rest && asInt(first.text) !== null && others.length === 0) {
    row.distanceM = asInt(first.text);
    return { row, extra: null, restShaped: false, restDurationDs: null };
  }
  row.durationDs = asTime(first.text, true);
  if (row.durationDs === null) return null;

  let extra: number | null = null;
  let stage = 1;
  for (const t of others) {
    const int = asInt(t.text);
    if (stage <= 1 && int !== null) {
      row.distanceM = int;
      stage = 2;
      continue;
    }
    const split = stage <= 2 ? asTime(t.text, false) : null;
    if (split !== null && split >= MIN_SPLIT_DS && split <= MAX_SPLIT_DS) {
      row.splitDs = split;
      stage = 3;
    } else if (stage <= 3 && int !== null && int >= 10 && int <= 70) {
      row.rate = int;
      stage = 4;
    } else if (stage <= 3 && int !== null && splitMergedRateAndExtra(int)) {
      const merged = splitMergedRateAndExtra(int)!;
      row.rate = merged.rate;
      extra = merged.extra;
      stage = 5;
    } else if (stage >= 2 && stage <= 4 && int !== null) {
      extra = int >= 1000 && int < 10000 ? Math.floor(int / 10) : int;
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
  return { row, extra, restShaped, restDurationDs: stripped ?? row.durationDs };
}

function markShapedRests(lines: ParsedLine[]): void {
  const work = lines.filter((l) => !l.restShaped && !l.row.isRest && l.row.splitDs !== null && l.row.distanceM !== null);
  if (work.length === 0) return;
  const distances = work.map((l) => l.row.distanceM!).sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)]!;
  for (const line of lines) {
    if (!line.restShaped || line.row.distanceM! >= median * 0.3) continue;
    line.row.isRest = true;
    line.row.durationDs = line.restDurationDs;
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
