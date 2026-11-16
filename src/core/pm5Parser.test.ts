import { describe, expect, it } from 'vitest';
import { parsePm5Text } from './pm5Parser';

describe('parsePm5Text', () => {
  it('parses a 2000m piece with 500m splits and detects the summary row', () => {
    const scan = parsePm5Text(`
      View Detail
      2000m row
      time    meter   /500m  s/m
      7:30.0  2000    1:52.5  28
      1:53.0  500     1:53.0  27
      1:52.5  500     1:52.5  28
      1:52.6  500     1:52.6  28
      1:51.9  500     1:51.9  29
    `);
    expect(scan).not.toBeNull();
    expect(scan!.summaryFromScreen).toBe(true);
    expect(scan!.splitDistance).toBe(500);
    expect(scan!.summary).toMatchObject({ durationDs: 4500, distanceM: 2000, splitDs: 1125, rate: 28 });
    expect(scan!.rows).toHaveLength(4);
    expect(scan!.rows[0]).toMatchObject({ durationDs: 1130, distanceM: 500, splitDs: 1130, rate: 27, isRest: false });
  });

  it('parses intervals with rest rows, heart rate and OCR letter noise', () => {
    const scan = parsePm5Text(`
      4x500m/1:00r
      time meter /500m s/m ♡
      8:00.0 2000 2:00.0 24 152
      2:00.0 500 2:00.0 24 145
      r1:00 r23
      2:0O.0 500 2:00.0 24 150
      r1:00 r20
      2:00.0 5OO 2:00.0 25 155
      r1:00 r21
      2:00.0 500 2:00.0 24 158
    `);
    expect(scan!.extraColumn).toBe('heartRate');
    expect(scan!.summaryFromScreen).toBe(true);
    expect(scan!.summary.heartRate).toBe(152);
    expect(scan!.rows).toHaveLength(7);
    expect(scan!.rows[1]).toEqual({
      durationDs: 600,
      distanceM: 23,
      splitDs: null,
      rate: null,
      heartRate: null,
      watts: null,
      calories: null,
      isRest: true,
    });
    expect(scan!.rows[2]).toMatchObject({ durationDs: 1200, distanceM: 500, heartRate: 150 });
    expect(scan!.rows[4]).toMatchObject({ distanceM: 500, rate: 25 });
  });

  it('maps the extra column to watts and reads /1000m splits from the header', () => {
    const scan = parsePm5Text(`
      time meter /1000m s/m watt
      30:00.0 7500 4:00.0 22 203
      10:00.0 2480 4:01.9 22 197
      10:00.0 2500 4:00.0 22 203
      10:00.0 2520 3:58.1 23 209
    `);
    expect(scan!.splitDistance).toBe(1000);
    expect(scan!.extraColumn).toBe('watts');
    expect(scan!.summary).toMatchObject({ durationDs: 18000, distanceM: 7500, watts: 203 });
    expect(scan!.rows.map((r) => r.watts)).toEqual([197, 203, 209]);
    expect(scan!.rows[0]!.heartRate).toBeNull();
  });

  it('repairs dropped decimal points and colons', () => {
    const scan = parsePm5Text(`
      time meter /500m s/m
      1:553 500 155.3 30
    `);
    expect(scan!.summary).toMatchObject({ durationDs: 1153, distanceM: 500, splitDs: 1153, rate: 30 });
  });

  it('computes the summary when the first row is not a total', () => {
    const scan = parsePm5Text(`
      2:00.0 500 2:00.0 24
      2:10.0 500 2:10.0 22
    `);
    expect(scan!.summaryFromScreen).toBe(false);
    expect(scan!.rows).toHaveLength(2);
    expect(scan!.summary).toMatchObject({ durationDs: 2500, distanceM: 1000, splitDs: 1250, rate: 23 });
  });

  it('fills a missing split from duration and distance', () => {
    const scan = parsePm5Text('time meter /500m s/m\n4:00.0 1000 24');
    expect(scan!.summary).toMatchObject({ durationDs: 2400, distanceM: 1000, splitDs: 1200, rate: 24 });
  });

  it('returns null when no data rows are found', () => {
    expect(parsePm5Text('Concept2\nMain Menu\nJust Row')).toBeNull();
  });
});
