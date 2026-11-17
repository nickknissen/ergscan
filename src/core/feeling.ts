/** How the rower felt about a workout, from 1 (weary) to 5 (beaming). */
export const FEELINGS = [1, 2, 3, 4, 5] as const;

export type Feeling = (typeof FEELINGS)[number];

/** FIT's session workout feel runs 0 (feeling bad) to 100 (feeling good); the five steps spread evenly across it. */
export function workoutFeel(feeling: Feeling): number {
  return (feeling - 1) * 25;
}

export function asFeeling(value: unknown): Feeling | null {
  return FEELINGS.find((f) => f === value) ?? null;
}
