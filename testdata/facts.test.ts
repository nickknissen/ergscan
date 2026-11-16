import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTime } from '../src/core/time';
import { loadFacts, TESTDATA_DIR } from './facts';

const all = loadFacts();

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
