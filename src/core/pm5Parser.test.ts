import { describe, expect, it } from 'vitest';
import { parsePm5Text } from './pm5Parser';

describe('parsePm5Text', () => {
  it('reads the drag factor when the screen shows it', () => {
    const scan = parsePm5Text(`
      View Detail
      2000m row
      Drag Factor: 12S
      time    meter   /500m  s/m
      7:30.0  2000    1:52.5  28
      1:53.0  500     1:53.0  27
      1:52.5  500     1:52.5  28
    `);
    expect(scan!.dragFactor).toBe(125);
    expect(scan!.rows).toHaveLength(2);
  });

  it('reads a drag factor that OCR ran together or merged with the header', () => {
    const scan = parsePm5Text(`
      DragFactor125 time meter /1000m s/m
      30:00.0 7500 4:00.0 22
      15:00.0 3750 4:00.0 22
      15:00.0 3750 4:00.0 22
    `);
    expect(scan!.dragFactor).toBe(125);
    expect(scan!.splitDistance).toBe(1000);
    expect(scan!.summaryFromScreen).toBe(true);
  });

  it('leaves the drag factor empty when the screen does not show it or it is implausible', () => {
    const body = `
      time    meter   /500m  s/m
      7:30.0  2000    1:52.5  28
    `;
    expect(parsePm5Text(body)!.dragFactor).toBeNull();
    expect(parsePm5Text(`drag factor 9\n${body}`)!.dragFactor).toBeNull();
  });

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

  it('turns a cumulative meter column into laps on a screen scrolled past the first splits', () => {
    const scan = parsePm5Text(
      [
        'time meter /500m s/m',
        '28:18.3 6000 2:21.5 31',
        '2:23.9 2500 2:23.9 30',
        '2:24.4 3000 2:24.4 31',
        '2:24.0 3500 2:24.0 32',
        '2:23.4 4000 2:23.4 32',
        '2:06.5 4500 2:06.5 38',
      ].join('\n'),
    );
    expect(scan!.summary).toMatchObject({ durationDs: 16983, distanceM: 6000 });
    expect(scan!.rows.map((r) => [r.durationDs, r.distanceM])).toEqual([
      [1439, 500],
      [1444, 500],
      [1440, 500],
      [1434, 500],
      [1265, 500],
    ]);
  });

  it('turns a cumulative time column into laps on a screen scrolled to the end, short last split included', () => {
    const scan = parsePm5Text(['time meter /500m s/m', '29:00.0 6261 2:19.0 27', '24:00.0 413 2:25.2 26', '26:00.0 463 2:09.5 27', '28:00.0 456 2:11.5 28', '29:00.0 248 2:01.0 33'].join('\n'));
    expect(scan!.summary.durationDs).toBe(17400);
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([1200, 1200, 1200, 600]);
  });

  it('leaves per-split times alone when a misread total is smaller than they add up to', () => {
    const scan = parsePm5Text(
      ['time meter /500m s/m', '31:47.8 10000 2:05.3 22 130', '5:13.5 1250 2:05.4 22 120', '5:13.6 2500 2:05.4 22 123', '5:13.3 3750 2:05.3 22 128', '6:13.4 5000 2:05.4 22 130', '5:13.5 6250 2:05.4 22 133'].join('\n'),
    );
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([3135, 3136, 3133, 3734, 3135]);
  });

  it('leaves a ladder of interval distances alone', () => {
    const scan = parsePm5Text(['time meter /500m s/m', '15:00.0 4500 1:40.0 30', '3:20.0 1000 1:40.0 30', '5:00.0 1500 1:40.0 30', '6:40.0 2000 1:40.0 30'].join('\n'));
    expect(scan!.rows.map((r) => r.distanceM)).toEqual([1000, 1500, 2000]);
  });

  it('turns a cumulative column into laps when there are only two splits and the last one ends at the total', () => {
    const justRow = parsePm5Text(['time meter watt s/m', '7:03.7 2017 302 30', '5:00.0 1441 310 30', '7:03.7 576 283 30'].join('\n'));
    expect(justRow!.summary.durationDs).toBe(4237);
    expect(justRow!.rows.map((r) => [r.durationDs, r.distanceM])).toEqual([
      [3000, 1441],
      [1237, 576],
    ]);
    const twoK = parsePm5Text(['time meter /500m s/m', '7:30.0 2000 1:52.5 28', '3:40.0 1000 1:50.0 28', '3:50.0 2000 1:55.0 28'].join('\n'));
    expect(twoK!.rows.map((r) => [r.durationDs, r.distanceM])).toEqual([
      [2200, 1000],
      [2300, 1000],
    ]);
  });

  it('does not take two rows for two splits when their paces say OCR lost the rows between them', () => {
    const scan = parsePm5Text(['time meter /500m', '6:29.9 2000 1:37.4 36', '1:38.2 1009 1:38.2 35', '1:37.6 2000 1:37.6 38'].join('\n'));
    expect(scan!.rows.map((r) => r.distanceM)).toEqual([1009, 2000]);
  });

  it('reads a BikeErg cadence above the rowing stroke rates', () => {
    const scan = parsePm5Text(['time meter /1000n rpm', '36:44.6 20000 1:50.2 87', '7:22.5 4000 1:50.6 88', '7:13.8 8000 1:48.4 89 145'].join('\n'));
    expect(scan!.splitDistance).toBe(1000);
    expect(scan!.summary.rate).toBe(87);
    expect(scan!.rows.map((r) => [r.rate, r.heartRate])).toEqual([
      [88, null],
      [89, 145],
    ]);
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
    ['Ago 12 2026 G', { year: 2026, month: 8, day: 12 }],
    ['Mai 07 2026', { year: 2026, month: 5, day: 7 }],
  ])('reads the workout date from %s', (line, date) => {
    const scan = parsePm5Text(`${line}\ntime meter /500m s/m\n2:00.0 500 2:00.0 24`);
    expect(scan!.date).toEqual(date);
  });

  it('reads the date and title rest below a line that looked like the table header', () => {
    const scan = parsePm5Text(
      [
        'Distance Pace Time',
        '47,530 m 2:19/500m 3h 40m',
        'v25000m/4:00r...3 Total Time:',
        'Oct 31, 2026 3:40:31.5',
        'time meter /500m s/m',
        '1:06:10.6 15000 2:12.3 22 117',
        '32:33.8 7,500 2:10.2 27 127',
      ].join('\n'),
    );
    expect(scan!.date).toEqual({ year: 2026, month: 10, day: 31 });
    expect(scan!.screen.titleRestDs).toBe(2400);
  });

  it('reads meters with thousands separators', () => {
    const scan = parsePm5Text('time meter /500m s/m\n1:50:43.0 25,000 2:12.8 21 120\n33:34.6 7.500 2:14.3 27 126');
    expect(scan!.summary.distanceM).toBe(25000);
    expect(scan!.rows[0]!.distanceM).toBe(7500);
  });

  it("reads a colon that OCR saw as a 1, taking the reading the row's pace and distance agree with", () => {
    // PM4, 2000 m in 250 m splits: the meter column is cumulative and each split takes under a minute.
    const scan = parsePm5Text(['time meter /500m', '6149,1 2000 1:42.2 30', '147.5 250 1:35.0 34', '150.3 500 1:40,6 30', ':51.8 750 1:43.6 28'].join('\n'));
    expect(scan!.summary.durationDs).toBe(4091);
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([475, 503, 518]);
  });

  it('keeps a time with a dropped colon when the arithmetic agrees with it', () => {
    expect(parsePm5Text('time meter /500m s/m\n117.1 500 1:17.1 36')!.summary.durationDs).toBe(771);
  });

  it('reads a time and a pace that both had their colon read as a 1', () => {
    const scan = parsePm5Text('time meter /500m s/m\n1:25.8 500 1:25.8 37\n117.1 100 1125.5 35\n:17.3 200 1:26.5 38');
    expect(scan!.rows.map((r) => r.durationDs)).toEqual([171, 173]);
    expect(scan!.rows[0]!.splitDs).toBe(855);
  });

  it('separates meters that OCR ran into the pace', () => {
    const scan = parsePm5Text(['time meter /500m', '42:09.6 100002:06,4 20', '8:25.7 20002:06.4 20', '8:26.0 40002:06.5 20', '8:26.8 60002:06,7 20'].join('\n'));
    expect(scan!.summary).toMatchObject({ distanceM: 10000, splitDs: 1264, rate: 20 });
    expect(scan!.rows.map((r) => [r.distanceM, r.splitDs, r.rate])).toEqual([
      [2000, 1264, 20],
      [2000, 1265, 20],
      [2000, 1267, 20],
    ]);
  });

  it('reads zeros that OCR saw as accented letters and a colon it saw as ±', () => {
    const scan = parsePm5Text('time meter /500m s/m\n15:09.1 40ã0 1:53.6 30\n1:54.9 5ã0 1:54.9 31\n1±54.4 50ó 1:54.4 29');
    expect(scan!.summary.distanceM).toBe(4000);
    expect(scan!.rows.map((r) => [r.durationDs, r.distanceM])).toEqual([
      [1149, 500],
      [1144, 500],
    ]);
  });

  it("reads a rest whose r OCR saw as a 1 when another rest on the screen has the time it would have", () => {
    const scan = parsePm5Text(['time meter /500m s/m', '14:49.3 4000 1:51.1 27', '1:48.7 500 1:48.7 28', '12:00.0 19', '1:49.4 500 1:49.4 29', 'r2:00.0 15'].join('\n'));
    expect(scan!.rows.map((r) => [r.durationDs, r.isRest])).toEqual([
      [1087, false],
      [1200, true],
      [1094, false],
      [1200, true],
    ]);
  });

  it('keeps a rest that really starts with a 1 when nothing says otherwise', () => {
    const scan = parsePm5Text(['time meter /500m s/m', '14:49.3 4000 1:51.1 27', '1:48.7 500 1:48.7 28', '12:00.0 19', '1:49.4 500 1:49.4 29'].join('\n'));
    expect(scan!.rows[1]).toMatchObject({ durationDs: 7200, isRest: true });
  });

  it('does not take a stray number after the rate for a heart rate', () => {
    expect(parsePm5Text('time meter /500m s/m\n8:26.8 6000 2:06.7 20 000')!.extraColumn).toBeNull();
  });

  it('returns null when no data rows are found', () => {
    expect(parsePm5Text('Concept2\nMain Menu\nJust Row')).toBeNull();
  });
});
