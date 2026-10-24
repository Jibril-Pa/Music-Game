/** Session state shared by scenes and the React UI. */

import type { GameStats } from "./events";

export const session = {
  mode: "keyboard" as "mic" | "keyboard",
  practice: false,
  paused: false,
  stats: null as GameStats | null,
  heroMaxHp: 100,
};

export function newStats(): GameStats {
  return { notesHeard: 0, perfects: 0, specials: 0, parries: 0, parryAttempts: 0, maxCombo: 0, startedAt: performance.now() };
}
