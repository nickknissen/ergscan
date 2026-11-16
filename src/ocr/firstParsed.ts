import { parsePm5Text, type ParsedScan } from '../core/pm5Parser';

export interface ScanOutcome {
  scan: ParsedScan | null;
  text: string;
}

export async function firstParsed(attempts: (() => Promise<string>)[]): Promise<ScanOutcome> {
  const rank = (o: ScanOutcome) => (o.scan ? o.scan.rows.length + 1 : 0);
  let best: ScanOutcome = { scan: null, text: '' };
  for (const attempt of attempts) {
    const text = await attempt();
    const candidate = { scan: parsePm5Text(text), text };
    const better = rank(candidate) > rank(best) || (rank(best) === 0 && !candidate.scan && text.length > best.text.length);
    if (better) best = candidate;
    if (rank(best) > 1) break;
  }
  return best;
}
