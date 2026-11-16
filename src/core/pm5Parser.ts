import { parseTime } from './time';
import { emptyRow, splitFor, sumRows, type ExtraColumn, type WorkoutRow } from './workout';

export interface ParsedScan {
  splitDistance: 500 | 1000;
  extraColumn: ExtraColumn | null;
  summary: WorkoutRow;
  summaryFromScreen: boolean;
  rows: WorkoutRow[];
}

type Token = { kind: 'time' | 'int'; value: number; rest: boolean };

const OCR_DIGIT_FIXES: Record<string, string> = { O: '0', o: '0', D: '0', I: '1', l: '1', '|': '1', S: '5', B: '8' };

export function parsePm5Text(text: string): ParsedScan | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let splitDistance: 500 | 1000 = 500;
  let extraColumn: ExtraColumn | null = null;
  let headerSeen = false;
  const parsed: { row: WorkoutRow; extra: number | null }[] = [];

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

  if (!headerSeen && parsed.some((p) => p.extra !== null)) extraColumn = 'heartRate';
  for (const p of parsed) {
    if (p.extra !== null && extraColumn) p.row[extraColumn] = p.extra;
    fillSplit(p.row, splitDistance);
  }

  const all = parsed.map((p) => p.row);
  const [first, ...rest] = all as [WorkoutRow, ...WorkoutRow[]];
  if (rest.length === 0) {
    return { splitDistance, extraColumn, summary: first, summaryFromScreen: true, rows: [] };
  }
  if (isSummaryOf(first, rest)) {
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
  const raw = line
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d+:\d{2})\.\s+(\d)\b/g, '$1.$2')
    .replace(/(\d+:\d{2})\s+\.(\d)\b/g, '$1.$2')
    .split(/\s+/);
  const tokens: Token[] = [];
  for (const piece of raw) {
    const token = classify(piece);
    if (token) tokens.push(token);
  }
  return tokens;
}

function classify(piece: string): Token | null {
  let text = piece.replace(/^[^\w:.|]+|[^\w:.|]+$/g, '');
  let rest = false;
  if (/^[rR]/.test(text)) {
    rest = true;
    text = text.slice(1);
  }
  if (!/\d/.test(text)) return null;
  text = text.replace(/[OoDIl|SB]/g, (c) => OCR_DIGIT_FIXES[c] ?? c);
  if (/^\d{1,2}:\d{3}$/.test(text)) text = `${text.slice(0, -1)}.${text.slice(-1)}`;
  else if (/^\d{3,4}\.\d$/.test(text)) text = `${text.slice(0, -4)}:${text.slice(-4)}`;
  else if (/^\d:\d{2}:\d{3}$/.test(text)) text = `${text.slice(0, -1)}.${text.slice(-1)}`;
  if (/^\d+$/.test(text)) return { kind: 'int', value: Number(text), rest };
  const ds = parseTime(text);
  if (ds !== null) return { kind: 'time', value: ds, rest };
  return null;
}

function readRow(tokens: Token[]): { row: WorkoutRow; extra: number | null } | null {
  const first = tokens[0];
  if (!first) return null;
  const row = emptyRow();
  row.isRest = first.rest;

  if (first.rest && first.kind === 'int') {
    row.distanceM = first.value;
    return { row, extra: null };
  }
  if (first.kind !== 'time') return null;
  row.durationDs = first.value;

  let extra: number | null = null;
  let stage = 1;
  for (const t of tokens.slice(1)) {
    if (stage <= 1 && t.kind === 'int') {
      row.distanceM = t.value;
      stage = 2;
    } else if (stage <= 2 && t.kind === 'time') {
      row.splitDs = t.value;
      stage = 3;
    } else if (stage <= 3 && t.kind === 'int' && t.value >= 10 && t.value <= 70 && !row.isRest) {
      row.rate = t.value;
      stage = 4;
    } else if (stage >= 2 && stage <= 4 && t.kind === 'int' && !row.isRest) {
      extra = t.value;
      stage = 5;
    }
  }

  const filled = [row.distanceM, row.splitDs, row.rate].filter((v) => v !== null).length;
  if (!row.isRest && filled === 0) return null;
  return { row, extra };
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
