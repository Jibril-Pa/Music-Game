/** Event names on the EventBus, and their payloads. */

import type { Grade } from "@/lib/combat/rhythm";
import type { NoteEvent } from "@/lib/input/types";

export const EV = {
  // Phaser -> React
  sceneReady: "current-scene-ready",
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
  objective?: string;
  /** Level progress 0..1 (auto-scroller)... */
  progress?: number;
  /** ...and the icon at the end of that path. */
  goalIcon?: string;
  /** Chords (or notes) wanted right now, nearest foe first: shown as shapes at the bottom. */
  wanted?: { symbol: string; role: "foe" | "heal" | "super" | "howl" }[];
  playMode?: "chords" | "notes";
}

export interface HeardEntry {
  ev: NoteEvent;
  grade: Grade | null;
  /** "Slew a wolf", "Parry!", "no match", ... */
  result: string;
  /** Did it hit something? */
  hit: boolean;
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
  perfects: number;
  slain: number;
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
