import { describe, expect, it } from 'vitest';
import { parsePm5Text } from './pm5Parser';
import { addsUp, scanTrust } from './scanTrust';

const HEADER = 'time meter /500m s/m';
const parse = (text: string) => parsePm5Text(text)!;

const CLEAN = `
  1000m
  Nov 02 2026
  ${HEADER}
  4:00.0 1000 2:00.0 24
  2:00.0 500 2:00.0 24
  2:00.0 500 2:00.0 24
`;

describe('addsUp', () => {
  it('is true when the splits add up to the on-screen summary', () => {
    expect(addsUp(parse(CLEAN))).toBe(true);
  });

  it('is false when a split time was misread', () => {
    expect(addsUp(parse(CLEAN.replace('2:00.0 500 2:00.0 24\n  2:00.0', '2:00.0 500 2:00.0 24\n  2:09.0')))).toBe(false);
  });

  it('is false without a scan', () => {
    expect(addsUp(null)).toBe(false);
  });
});

describe('scanTrust', () => {
  it('ranks a clean read above one with a misread split and an implausible rate', () => {
    const misread = CLEAN.replace('2:00.0 500 2:00.0 24\n  2:00.0 500 2:00.0 24', '2:00.0 500 2:50.0 24\n  2:00.0 500 2:00.0 2');
    expect(scanTrust(parse(CLEAN))).toBeGreaterThan(scanTrust(parse(misread)));
  });

  it('ranks a read with more checked rows above one that lost a row', () => {
    const lostRow = CLEAN.replace(/\n {2}2:00\.0 500 2:00\.0 24\n$/, '\n');
    expect(scanTrust(parse(CLEAN))).toBeGreaterThan(scanTrust(parse(lostRow)));
  });

  it('checks splits against the meters between rows on a scrolled screen with cumulative meters', () => {
    const scrolled = `${HEADER}\n2:00.0 2500 2:00.0 24\n2:00.0 3000 2:00.0 24\n2:00.0 3500 2:00.0 24`;
    const garbled = `${HEADER}\n2:00.0 2500 2:30.0 24\n2:00.0 3000 2:30.0 24\n2:00.0 3500 2:30.0 24`;
    expect(scanTrust(parse(scrolled))).toBeGreaterThan(scanTrust(parse(garbled)) + 5);
  });

  it('scores a missing read below any read', () => {
    expect(scanTrust(null)).toBeLessThan(scanTrust(parse(`${HEADER}\n2:00.0 500 2:00.0 24`)));
  });
});
