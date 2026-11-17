import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTime } from '../src/core/time';
import { loadFacts, loadMultiFacts, TESTDATA_DIR } from './facts';

const all = loadFacts();
const multi = loadMultiFacts();

describe('multi-photo fact files', () => {
  it('exist', () => {
    expect(multi.length).toBeGreaterThan(0);
  });

  describe.each(multi)('$name', ({ facts }) => {
    const pages = facts.pages.map((name) => all.find((f) => f.name === name)?.facts);

    it('name at least two single-photo fact files', () => {
      expect(pages.length).toBeGreaterThanOrEqual(2);
      for (const page of pages) expect(page).toBeDefined();
    });

    it('keeps the summary and date of the first photo', () => {
      expect(facts.workout.summary).toEqual(pages[0]!.workout.summary);
      expect(facts.workout.date).toBe(pages[0]!.workout.date);
    });

    it('has more laps than any one photo', () => {
      for (const page of pages) expect(facts.workout.laps.length).toBeGreaterThan(page!.workout.laps.length);
    });

    it.runIf(facts.workout.complete)('has work laps that add up to the summary', () => {
      const work = facts.workout.laps.filter((l) => !l.rest);
      const time = work.reduce((a, l) => a + parseTime(l.time)!, 0);
      const meters = work.reduce((a, l) => a + (l.meters ?? 0), 0);
      expect(Math.abs(time - parseTime(facts.workout.summary.time)!)).toBeLessThanOrEqual(2);
      expect(Math.abs(meters - facts.workout.summary.meters)).toBeLessThanOrEqual(2);
    });
  });
});

describe('testdata fact files', () => {
  it('exist', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  describe.each(all)('$name', ({ facts }) => {
    it('points at an image next to it', () => {
      expect(existsSync(join(TESTDATA_DIR, facts.image))).toBe(true);
    });

    it('marks a screen rectangle inside the image', () => {
      const { x, y, width, height } = facts.screenRect;
      expect(Math.min(x, y, width, height)).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(1);
      expect(y + height).toBeLessThanOrEqual(1);
    });

    it('uses valid PM times everywhere', () => {
      const times = [facts.workout.summary.time, facts.workout.summary.split, ...facts.workout.laps.map((l) => l.time)];
      for (const t of times) expect(parseTime(t), t).not.toBeNull();
    });

    it('has a summary split that matches its time and meters', () => {
      const { time, meters, split } = facts.workout.summary;
      const expected = (parseTime(time)! / meters) * facts.workout.splitDistance;
      expect(Math.abs(expected - parseTime(split)!)).toBeLessThanOrEqual(1);
    });

    it.runIf(facts.workout.complete)('has work laps that add up to the summary', () => {
      const work = facts.workout.laps.filter((l) => !l.rest);
      const time = work.reduce((a, l) => a + parseTime(l.time)!, 0);
      const meters = work.reduce((a, l) => a + (l.meters ?? 0), 0);
      expect(Math.abs(time - parseTime(facts.workout.summary.time)!)).toBeLessThanOrEqual(2);
      expect(Math.abs(meters - facts.workout.summary.meters)).toBeLessThanOrEqual(2);
    });

    it.runIf(facts.screen.totalTime !== undefined)('has laps including rest that add up to Total Time', () => {
      const total = facts.workout.laps.reduce((a, l) => a + parseTime(l.time)!, 0);
      const screenTotal = parseTime(facts.screen.totalTime!)!;
      if (facts.workout.complete) expect(Math.abs(total - screenTotal)).toBeLessThanOrEqual(2);
      else expect(total).toBeLessThan(screenTotal);
    });
  });
});
