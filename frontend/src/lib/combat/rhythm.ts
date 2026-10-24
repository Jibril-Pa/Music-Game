/** On-beat bonus. Never a penalty: "off" just means no bonus. */

export type Grade = "perfect" | "good" | "off";

export const RHYTHM_CONFIG = {
  perfectMs: 80,
  goodMs: 160,
  /** Practice mode widens everything. */
  practicePerfectMs: 140,
  practiceGoodMs: 260,
  /** Boss parry window around each attack note. */
  parryMs: 150,
  practiceParryMs: 260,
};

export const GRADE_DAMAGE: Record<Grade, number> = { perfect: 1.5, good: 1, off: 1 };
export const GRADE_MAGIC: Record<Grade, number> = { perfect: 1.8, good: 1.2, off: 1 };

export function judge(offsetMs: number | null, practice: boolean): Grade {
  if (offsetMs === null) return "off";
  const a = Math.abs(offsetMs);
  if (a <= (practice ? RHYTHM_CONFIG.practicePerfectMs : RHYTHM_CONFIG.perfectMs)) return "perfect";
  if (a <= (practice ? RHYTHM_CONFIG.practiceGoodMs : RHYTHM_CONFIG.goodMs)) return "good";
  return "off";
}

export function parryWindow(practice: boolean): number {
  return practice ? RHYTHM_CONFIG.practiceParryMs : RHYTHM_CONFIG.parryMs;
}

/** Anything that knows where the beats are, in performance.now() ms (as heard). */
export interface BeatClock {
  /** Signed ms from `perfMs` to the nearest beat (negative = played early), or null if not playing. */
  offsetToNearestBeat(perfMs: number): number | null;
  readonly bpm: number;
}
