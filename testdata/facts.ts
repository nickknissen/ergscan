import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FactLap {
  time: string;
  meters?: number;
  rate?: number;
  heartRate?: number;
  rest?: boolean;
}

export interface Facts {
  image: string;
  monitor: string;
  capture: string;
  screen: {
    title: string;
    date: string;
    totalTime?: string;
    header: string[];
    rows: string[][];
  };
  workout: {
    type: string;
    date: string;
    splitDistance: 500 | 1000;
    complete: boolean;
    summary: { time: string; meters: number; split: string; rate: number; heartRate?: number };
    laps: FactLap[];
  };
  notes: string;
}

export const TESTDATA_DIR = import.meta.dirname;

export function loadFacts(): { name: string; facts: Facts }[] {
  return readdirSync(TESTDATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), facts: JSON.parse(readFileSync(join(TESTDATA_DIR, f), 'utf8')) as Facts }));
}
