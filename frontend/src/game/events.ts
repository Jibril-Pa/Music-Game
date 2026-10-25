/** Event names on the EventBus, and their payloads. */

import type { Grade } from "@/lib/combat/rhythm";
import type { NoteEvent } from "@/lib/input/types";

export const EV = {
  // Phaser -> React
  sceneReady: "current-scene-ready",
  /** Boot's art download, 0..1 (React shows a loading plate until the Title scene is ready). */
  bootProgress: "boot-progress",
  hud: "hud",
  heard: "heard",
  beat: "beat",
  bossIntro: "boss-intro",
  bossLoading: "boss-loading",
  gameOver: "game-over",
  fps: "fps",
  toast: "toast",
  // React -> Phaser
  startGame: "start-game",
  tuneDone: "tune-done",
  setPaused: "set-paused",
  setPractice: "set-practice",
  bossSongChosen: "boss-song-chosen",
  restart: "restart",
  quitToTitle: "quit-to-title",
} as const;

export interface HudState {
  scene: string;
  heroHp: number;
  heroMaxHp: number;
  magic: number; // 0..100
  combo: number; // hit streak
  /** Symbol that casts the super when the meter is full ("E" chord / "C" note). */
  superSymbol: string;
  enemy?: { name: string; hp: number; maxHp: number } | null;
  boss?: { name: string; hp: number; maxHp: number; phase: string } | null;
  /** An instruction ("Play all the troll's chords to cross the bridge"). The HUD banners it when it changes. */
  objective?: string;
  /** Level progress 0..1 (auto-scroller)... */
  progress?: number;
  /** ...and the icon at the end of that path. */
  goalIcon?: string;
  /** Wanted now, most urgent first: the next howl, then foes nearest-first, then heal, then super. At most 4. */
  wanted?: { symbol: string; role: "foe" | "heal" | "super" | "howl" }[];
  playMode?: "chords" | "notes";
  /** The super cinematic or the boss countdown is playing: the React HUD steps aside. */
  cinematic?: boolean;
}

export interface HeardEntry {
  ev: NoteEvent;
  /** How it landed on the beat (or on the howl, for a parry). Always null for a miss. */
  grade: Grade | null;
  /** Narrative result for screen readers and the dev overlay ("slew the forest wolf", "needs Em"). */
  result: string;
  /** Did it hit something? */
  hit: boolean;
  /** What would have counted: the symbols this input hit or, for a miss, what was wanted then (the next
   *  howl, else the nearest foe's chords). Empty when there was nothing to hit. The lute's coach reads it. */
  wanted?: string[];
  /** Signed ms from the nearest beat (negative = early), or from the howl for a parry. null: no beat to judge. */
  offsetMs?: number | null;
  /** The short line under the chord, shared by the bard's bubble and the Ear caption (≤ 20 chars):
   *  "Perfect!" | "Good" | "Early" | "Late" | "Sent back!" | "Perfect! Sent back" | "Healed!" | "Happily Ever After!" | "needs Em" | "needs Em or G" | "" */
  line?: string;
}

export interface GameOverInfo {
  victory: boolean;
  stats: GameStats;
  scene: string;
  /** Index into LEVELS of the level that just ended. */
  level: number;
}

export interface GameStats {
  notesHeard: number;
  /** Inputs that hit something (foes, candies, gusts, the wolf, parries, heal, super). */
  hits: number;
  /** Perfect hits only: a miss is never a perfect. */
  perfects: number;
  slain: number;
  /** Inputs that hit nothing while something was there to hit. */
  misses: number;
  parries: number;
  parryAttempts: number;
  maxCombo: number;
  startedAt: number;
  endedAt?: number;
}

export interface BossSongChoice {
  kind: "demo" | "job";
  jobId?: string;
  title: string;
}
