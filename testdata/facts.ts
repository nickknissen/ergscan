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
  screenRect: { x: number; y: number; width: number; height: number };
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

/** One workout photographed across several scrolled screens; `pages` name the single-photo fact files in scan order. */
export interface MultiFacts {
  pages: string[];
  workout: Facts['workout'];
  notes: string;
}

export const TESTDATA_DIR = import.meta.dirname;
export const MULTI_DIR = join(TESTDATA_DIR, 'multi');

function loadJson<T>(dir: string): { name: string; facts: T }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), facts: JSON.parse(readFileSync(join(dir, f), 'utf8')) as T }));
}

export function loadFacts(): { name: string; facts: Facts }[] {
  return loadJson<Facts>(TESTDATA_DIR);
}

export function loadMultiFacts(): { name: string; facts: MultiFacts }[] {
  return loadJson<MultiFacts>(MULTI_DIR);
}
