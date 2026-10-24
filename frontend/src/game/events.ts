/** Event names on the EventBus, and their payloads. */

import type { Grade } from "@/lib/combat/rhythm";
import type { ComboProgress, MoveId } from "@/lib/combat/combos";
import type { NoteEvent } from "@/lib/input/types";

export const EV = {
  // Phaser -> React
  sceneReady: "current-scene-ready",
  hud: "hud",
  heard: "heard",
  comboProgress: "combo-progress",
  moveUsed: "move-used",
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
  combo: number; // hit counter
  shield: boolean;
  enemy?: { name: string; hp: number; maxHp: number } | null;
  boss?: { name: string; hp: number; maxHp: number; phase: string } | null;
  objective?: string;
}

export interface HeardEntry {
  ev: NoteEvent;
  grade: Grade | null;
  /** "Lute Strike", "Parry!", ... */
  result: string;
  special: boolean;
}

export interface MoveUsed {
  id: MoveId;
  name: string;
  grade: Grade | null;
}

export type { ComboProgress };

export interface GameOverInfo {
  victory: boolean;
  stats: GameStats;
  scene: string;
}

export interface GameStats {
  notesHeard: number;
  perfects: number;
  specials: number;
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
