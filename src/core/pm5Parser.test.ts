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

  it('reads /1000m splits from the header and heart rate from the last column', () => {
    const scan = parsePm5Text(`
      time meter /1000m s/m ♥
      30:00.0 7500 4:00.0 22 150
      10:00.0 2480 4:01.9 22 145
      10:00.0 2500 4:00.0 22 151
      10:00.0 2520 3:58.1 23 155
    `);
    expect(scan!.splitDistance).toBe(1000);
    expect(scan!.extraColumn).toBe('heartRate');
    expect(scan!.rows.map((r) => [r.splitDs, r.heartRate])).toEqual([
      [2419, 145],
      [2400, 151],
      [2381, 155],
    ]);
  });

  it('reads watts from the pace column when Units is set to watts', () => {
    const scan = parsePm5Text('time meter watt s/m ♥\n20:00.0 5000 203 22 150\n10:00.0 2480 197 22 145\n10:00.0 2520 209 23 155');
    expect(scan!.summary).toMatchObject({ watts: 203, rate: 22, heartRate: 150, splitDs: 1200 });
    expect(scan!.rows.map((r) => r.watts)).toEqual([197, 209]);
  });

  it('skips the cal/hr pace column and derives the split (PM4 OCR output)', () => {
    const scan = parsePm5Text(
      ['= meter calf Mm ®', '300.0  6828  825 25', '6:000 1392 857 23', '12000 1394  859 2S', '| 1800.0 1385  848 27', '| 24000 1343 800 26', '| 30000 1314 768 26'].join('\n'),
    );
    expect(scan!.summary).toMatchObject({ durationDs: 18000, distanceM: 6828, rate: 25, heartRate: null, splitDs: 1318 });
    expect(scan!.rows.map((r) => [r.durationDs, r.distanceM, r.rate])).toEqual([
      [3600, 1392, 23],
      [3600, 1394, 25],
      [3600, 1385, 27],
      [3600, 1343, 26],
      [3600, 1314, 26],
    ]);
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

  it('reads real Tesseract output with dropped colons, lost rest markers and an unreadable heart icon', () => {
    const scan = parsePm5Text(
      [
        'EE',
        '4x500m/1:00r',
        'time               meter                 /500m                  s/m             Q',
        '8.000                              2000                                         2000                                           24                                152',
        '2013                           500                                       2013                                      23                             141',
        'r1:00                             23',
        '1598                           500                                       1598                                      24                             150',
        '71:00                             21',
        '2:00.1                              500                                           2.00.1                                           24                                156',
        '1:00                             22',
        '1588                           500                                       1588                                      25                             161',
        '                                                                                                                                              CL',
      ].join('\n'),
    );
    expect(scan!.extraColumn).toBe('heartRate');
    expect(scan!.summaryFromScreen).toBe(true);
    expect(scan!.summary).toMatchObject({ durationDs: 4800, distanceM: 2000, splitDs: 1200, rate: 24, heartRate: 152 });
    const compact = scan!.rows.map((r) => [r.durationDs, r.distanceM, r.splitDs, r.rate, r.heartRate, r.isRest]);
    expect(compact).toEqual([
      [1213, 500, 1213, 23, 141, false],
      [600, 23, null, null, null, true],
      [1198, 500, 1198, 24, 150, false],
      [600, 21, null, null, null, true],
      [1201, 500, 1201, 24, 156, false],
      [600, 22, null, null, null, true],
      [1188, 500, 1188, 25, 161, false],
    ]);
  });

  it('does not treat a work row with missing split and rate as rest when its distance is normal', () => {
    const scan = parsePm5Text('2:00.0 500 2:00.0 24\n2:00.0 480\n2:00.0 500 2:00.0 24');
    expect(scan!.rows[1]).toMatchObject({ isRest: false, distanceM: 480, splitDs: 1250 });
  });

  it('repairs cell-level OCR slips seen on real photos', () => {
    const scan = parsePm5Text(
      [
        'time meter fS00m Zn \\ 4',
        '59:59.9 9999 1:43.6 34  A',
        '1:442 500 1:44.2 34150!Y',
        '1:440 500 1:44.0 341514',
        '© L431 500 1:43.01 34152)',
        '5.00.0 1056 2:20,3 20  v',
        '30:10.2 40 2i07.5 18  .',
        '1:43.6 3000 1:43.6 30 1649',
        '1:43.4 1000 1:43.4 29 155|_',
      ].join('\n'),
    );
    const compact = scan!.rows.map((r) => [r.durationDs, r.distanceM, r.splitDs, r.rate, r.heartRate]);
    expect(compact).toEqual([
      [1042, 500, 1042, 34, 150],
      [1040, 500, 1040, 34, 151],
      [1031, 500, 1030, 34, 152],
      [3000, 1056, 1403, 20, null],
      [18102, 40, 1275, 18, null],
      [1036, 3000, 1036, 30, 164],
      [1034, 1000, 1034, 29, 155],
    ]);
  });

  it('turns a cumulative time column into per-split durations', () => {
    const scan = parsePm5Text(
      [
        'time meter /500m s/m',
        '30:10.2 6518 2:18.8 20',
        '5:00.0 1056 2:22.0 20',
        '10:00.0 1073 2:19.7 20',
        '15:00.0 1069 2:20.3 20',
        '20:00.0 1068 2:20.4 20',
        '>c.00.0 1069 2:20.3 21',
        '30:00.0 1144 2:11.1 25',
        '30:10.2 40 2:07.5 18',
      ].join('\n'),
    );
    expect(scan!.summary.durationDs).toBe(18102);
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([3000, 3000, 3000, 3000, 3000, 3000, 102]);
    expect(scan!.rows.map((r) => r.distanceM)).toEqual([1056, 1073, 1069, 1068, 1069, 1144, 40]);
  });

  it('computes the total when OCR dropped the summary row instead of shifting every lap', () => {
    const scan = parsePm5Text(
      ['time meter fS00m mn 4', '5:00.0 1056 2:22.0 20', '10:00.0 1073 2:19.7 20', '15:00.0 1069 2:20.3 20', '30:00.0 1144 2:11.1 25'].join('\n'),
    );
    expect(scan!.summaryFromScreen).toBe(false);
    expect(scan!.rows).toHaveLength(4);
    expect(scan!.summary).toMatchObject({ durationDs: 4 * 3000, distanceM: 1056 + 1073 + 1069 + 1144 });
  });

  it('keeps the screen total when only one misread lap is larger than it', () => {
    const scan = parsePm5Text(
      ['time meter /500m s/m', '33.497 10000 2:11.4 18 112', '8:49.1 2000 2:12.2 19 107', '8145.1 4000 2:11.2 18 110', '8:42.2 6000 2:10.5 18 113', '8:44.4 8000 2:11.1 18 116'].join('\n'),
    );
    expect(scan!.summaryFromScreen).toBe(true);
    expect(scan!.summary.distanceM).toBe(10000);
    expect(scan!.rows).toHaveLength(4);
  });

  it('keeps a row whose time is unreadable instead of shifting every row up', () => {
    const scan = parsePm5Text(
      ['Nov 10 2026  41:434 la', 'time meter /500m s/m', '| 2%:15.2 6012 2:59 23 [A', '5:00.0 1012 2:28.2 19', '10:00.0 1040 2:24.2 23'].join('\n'),
    );
    expect(scan!.summary).toMatchObject({ durationDs: null, distanceM: 6012, rate: 23 });
    expect(scan!.rows).toHaveLength(2);
  });

  it('turns a cumulative meter column into per-split distances, including a short last split', () => {
    const scan = parsePm5Text(
      [
        'time meter /500m s/m',
        '1:33:46.6 21100 2:13.3 20',
        '18:36.5 4300 2:09.8 21',
        '19:04.8 8600 2:13.1 20',
        '19:43.8 12900 2:17.6 20',
        '19:35.0 17200 2:16.6 19',
        '16:46.6 21100 2:09.0 22',
      ].join('\n'),
    );
    expect(scan!.rows.map((r) => r.distanceM)).toEqual([4300, 4300, 4300, 4300, 3900]);
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([11165, 11448, 11838, 11750, 10066]);
  });

  it('de-accumulates even when the first split time is unreadable, and fixes a misread total (camera capture)', () => {
    const scan = parsePm5Text(
      [
        'time meter /500m s/m',
        '1:45:10.2 6518 2:18.8 20',
        '5:0#.0 1056 2:22.0 20',
        '10:00.0 1073 2:19.7 20',
        '15:00.0 1069 2:20.3 20',
        '20:00.0 1068 2:20.4 20',
        '25:00.0 1069 2:20.3 21',
        '30:00.0 1144 2:11.1 25',
        '30:10.2 40 2:07.5 18',
      ].join('\n'),
    );
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([3000, 3000, 3000, 3000, 3000, 3000, 102]);
    expect(scan!.summary).toMatchObject({ durationDs: 18102, distanceM: 6518, splitDs: 1389 });
    expect(scan!.summary.durationDs).not.toBe(63102);
  });

  it('keeps a total that agrees with its own split even if one lap is misread', () => {
    const scan = parsePm5Text(['time meter /500m s/m', '6:00.0 1500 2:00.0 24', '2:00.0 500 2:00.0 24', '2:30.0 500 2:30.0 24', '2:00.0 500 2:00.0 24'].join('\n'));
    expect(scan!.summary.durationDs).toBe(3600);
  });

  it('leaves interval rows with equal distances alone', () => {
    const scan = parsePm5Text('time meter /500m s/m\n3:28.7 1000 1:44.3 33\n1:44.7 500 1:44.7 32\n1:44.0 500 1:44.0 34');
    expect(scan!.rows.map((r) => [r.durationDs, r.distanceM])).toEqual([
      [1047, 500],
      [1040, 500],
    ]);
  });

  it('adds rest laps from the interval title when the screen lists no rest rows', () => {
    const scan = parsePm5Text(
      ['3¢S00mJS3:30r  Total Time:  o', 'Nov 10 2026  41:434 la', 'time meter /500m s/m', '3:28.7 1000 1:44.3 33', '1:44.7 500 1:44.7 32', '1:44.0 500 1:44.0 34'].join('\n'),
    );
    expect(scan!.rows.map((r) => [r.durationDs, r.isRest])).toEqual([
      [1047, false],
      [2100, true],
      [1040, false],
      [2100, true],
    ]);
  });

  it('does not add title rest when rest rows are on screen', () => {
    const scan = parsePm5Text('v25000m/4:00r...5\ntime meter /500m s/m\n1:54:43.0 25014 2:17.6 21\n1:50:43.0 25000 2:12.8 21 120\nr4:00 14');
    expect(scan!.rows.filter((r) => r.isRest)).toHaveLength(1);
  });

  it.each([
    ['Oct 06 2026  c  a', { year: 2026, month: 10, day: 6 }],
    ['Nov 4, 2026', { year: 2026, month: 11, day: 4 }],
    ['Sep 20 2026', { year: 2026, month: 9, day: 20 }],
    ['Mow 05 2026  -.  w', null],
    ['Nev 05 2026', { year: 2026, month: 11, day: 5 }],
    ['ou 31 2026  FRD7-233%  a', null],
  ])('reads the workout date from %s', (line, date) => {
    const scan = parsePm5Text(`${line}\ntime meter /500m s/m\n2:00.0 500 2:00.0 24`);
    expect(scan!.date).toEqual(date);
  });

  it('reads meters with thousands separators', () => {
    const scan = parsePm5Text('time meter /500m s/m\n1:50:43.0 25,000 2:12.8 21 120\n33:34.6 7.500 2:14.3 27 126');
    expect(scan!.summary.distanceM).toBe(25000);
    expect(scan!.rows[0]!.distanceM).toBe(7500);
  });

  it('returns null when no data rows are found', () => {
    expect(parsePm5Text('Concept2\nMain Menu\nJust Row')).toBeNull();
  });
});
