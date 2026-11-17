import { describe, expect, it } from 'vitest';
import { parsePm5Text } from './pm5Parser';
import { mergeScans, rowsMissing } from './scanMerge';

const HEADER = 'time meter /500m s/m';

const DISTANCE_PAGE_1 = `
  8047m
  Nov 02 2026
  ${HEADER}
  36:20.4 8047 2:15.4 19
  2:08.6 500 2:08.6 20
  2:06.8 1000 2:06.8 19
  2:12.5 1500 2:12.5 21
  2:18.2 2000 2:18.2 20
  2:21.0 2500 2:21.0 17
  2:23.8 3000 2:23.8 17
  2:17.9 3500 2:17.9 16
  2:14.3 4000 2:14.3 16
`;

const DISTANCE_PAGE_2 = `
  8047m
  Nov 02 2026
  ${HEADER}
  36:20.4 8047 2:15.4 19
  2:14.3 4000 2:14.3 16
  2:19.6 4500 2:19.6 15
  2:15.9 5000 2:15.9 18
  2:19.8 5500 2:19.8 16
  2:14.8 6000 2:14.8 21
  2:14.6 6500 2:14.6 22
  2:19.6 7000 2:19.6 19
  2:12.4 7500 2:12.4 22
`;

const parse = (text: string) => parsePm5Text(text)!;

describe('mergeScans', () => {
  it('appends the next page of a cumulative meter column once, as 500 m laps', () => {
    const merged = mergeScans(parse(DISTANCE_PAGE_1), parse(DISTANCE_PAGE_2));
    expect(merged.rows.map((r) => r.durationDs)).toEqual([1286, 1268, 1325, 1382, 1410, 1438, 1379, 1343, 1396, 1359, 1398, 1348, 1346, 1396, 1324]);
    expect(merged.rows.every((r) => r.distanceM === 500)).toBe(true);
    expect(merged.summary).toMatchObject({ durationDs: 21804, distanceM: 8047 });
    expect(merged.summaryFromScreen).toBe(true);
    expect(merged.date).toEqual({ year: 2026, month: 11, day: 2 });
  });

  it('turns a cumulative time column across two pages into 2 minute laps', () => {
    const page1 = `
      ${HEADER}
      30:00.0 6509 2:18.2 27
      2:00.0 418 2:23.5 26
      4:00.0 446 2:14.5 28
      6:00.0 443 2:15.4 28
      8:00.0 432 2:18.8 27
      10:00.0 423 2:21.8 27
      12:00.0 421 2:22.5 28
      14:00.0 416 2:24.2 27
      16:00.0 430 2:19.5 26
    `;
    const page2 = `
      ${HEADER}
      30:00.0 6509 2:18.2 27
      16:00.0 430 2:19.5 26
      18:00.0 428 2:20.1 27
      20:00.0 411 2:25.9 25
      22:00.0 415 2:24.5 26
      24:00.0 413 2:25.2 26
      26:00.0 463 2:09.5 27
      28:00.0 456 2:11.5 28
      30:00.0 496 2:00.9 33
    `;
    const merged = mergeScans(parse(page1), parse(page2));
    expect(merged.rows).toHaveLength(15);
    expect(merged.rows.every((r) => r.durationDs === 1200)).toBe(true);
    expect(merged.rows.map((r) => r.distanceM)).toEqual([418, 446, 443, 432, 423, 421, 416, 430, 428, 411, 415, 413, 463, 456, 496]);
  });

  it('adds nothing when the same screen is photographed twice', () => {
    const merged = mergeScans(parse(DISTANCE_PAGE_1), parse(DISTANCE_PAGE_1));
    expect(merged.rows).toHaveLength(8);
  });

  it('still recognises the shared row when OCR missed one of its cells on the second photo', () => {
    const merged = mergeScans(parse(DISTANCE_PAGE_1), parse(DISTANCE_PAGE_2.replace('2:14.3 4000 2:14.3 16', '2:14.3 4000 16')));
    expect(merged.rows).toHaveLength(15);
  });

  it('appends every row when the photos do not overlap', () => {
    const merged = mergeScans(parse(DISTANCE_PAGE_1), parse(DISTANCE_PAGE_2.replace(/\n\s*2:14\.3 4000 2:14\.3 16/, '')));
    expect(merged.rows).toHaveLength(15);
    expect(merged.rows.every((r) => r.distanceM === 500)).toBe(true);
  });
});

describe('rowsMissing', () => {
  it('is true while the laps fall short of the total meters', () => {
    expect(rowsMissing(parse(DISTANCE_PAGE_1))).toBe(true);
    expect(rowsMissing(mergeScans(parse(DISTANCE_PAGE_1), parse(DISTANCE_PAGE_2)))).toBe(true);
  });

  it('is false once the laps add up to the total', () => {
    const lastPage = `${HEADER}\n36:20.4 8047 2:15.4 19\n2:12.4 7500 2:12.4 22\n2:13.0 8000 2:13.0 22\n0:12.1 8047 2:08.7 25`;
    const all = mergeScans(mergeScans(parse(DISTANCE_PAGE_1), parse(DISTANCE_PAGE_2)), parse(lastPage));
    expect(all.rows).toHaveLength(17);
    expect(all.rows.at(-1)!.distanceM).toBe(47);
    expect(rowsMissing(all)).toBe(false);
  });

  it('is true while the laps fall short of the total time', () => {
    const scan = parse(`${HEADER}\n30:00.0 6509 2:18.2 27\n2:00.0 418 2:23.5 26\n4:00.0 446 2:14.5 28\n6:00.0 443 2:15.4 28`);
    expect(rowsMissing(scan)).toBe(true);
  });

  it('is false when the total was not on the screen', () => {
    const scan = parse('2:00.0 500 2:00.0 24\n2:00.0 500 2:00.0 24\n2:00.0 500 2:00.0 24');
    expect(scan.summaryFromScreen).toBe(false);
    expect(rowsMissing(scan)).toBe(false);
  });
});
