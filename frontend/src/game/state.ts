/** Session state shared by scenes and the React UI. */

import type { PlayMode } from "@/lib/combat/spells";
import type { GameStats } from "./events";

export const session = {
  /** Input device: the mic (a guitar) or the keyboard fallback. */
  mode: "keyboard" as "mic" | "keyboard",
  /** What enemies ask for: chords, or single notes (easier). */
  playMode: "chords" as PlayMode,
  practice: false,
  paused: false,
  stats: null as GameStats | null,
  heroMaxHp: 100,
  /** Index into LEVELS (levels.ts): the level being played. */
  level: 0,
};

export function newStats(): GameStats {
  return { notesHeard: 0, perfects: 0, slain: 0, parries: 0, parryAttempts: 0, maxCombo: 0, misses: 0, startedAt: performance.now() };
}
