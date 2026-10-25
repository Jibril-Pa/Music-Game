/**
 * The lute's coach: shapes shared by the game, the backend (backend/app/coach_api.py, coach.py)
 * and the end screen.
 */

import type { Grade } from "@/lib/combat/rhythm";
import type { PlayMode } from "@/lib/combat/spells";
import type { InputSource } from "@/lib/input/types";

/** One input the game judged: a row of Tiger Data's `plays` hypertable. */
export interface PlayRecord {
  /** ISO time of the strum (the onset, not when the ear named it). */
  t: string;
  levelId: string;
  world: string;
  scene: string;
  mode: PlayMode;
  input: InputSource;
  practice: boolean;
  /** What the ear heard ("Am", or "E" for a single note). */
  played: string;
  /** What the player was going for: the symbol hit or, for a miss, the wanted one closest to what was played. null: nothing to hit. */
  target: string | null;
  /** Everything that would have counted. */
  wanted: string[];
  hit: boolean;
  grade: Grade | null;
  /** Signed ms from the beat (negative = early). */
  offsetMs: number | null;
  confidence: number;
  latencyMs: number | null;
}

export interface ChordStat {
  chord: string;
  tries: number;
  hits: number;
  /** Mic misses only: what the ear heard instead, and how often. */
  heardAs: Record<string, number>;
}

/** A switch from one chord to another: how often the first strum after it landed. */
export interface ChangeStat {
  from: string;
  to: string;
  changes: number;
  firstTry: number;
}

/** One run (from the first level played to the End screen), as the coach sees it. */
export interface RunSummary {
  levels: string[];
  world: string;
  victory: boolean;
  seconds: number;
  mode: PlayMode;
  input: InputSource;
  practice: boolean;
  tries: number;
  hits: number;
  perfects: number;
  slain: number;
  maxCombo: number;
  /** Most misses first. */
  chords: ChordStat[];
  changes: ChangeStat[];
  timing: { n: number; meanMs: number | null; earlyShare: number; lateShare: number } | null;
}

export interface Advice {
  headline: string;
  praise: string;
  /** "C" or "G to C". */
  focus: string;
  tips: { title: string; body: string }[];
  drill: { chords: string[]; reps: number; how: string } | null;
  goal: string;
}

/** [hits, tries] */
export type HitsTries = [number, number];

/** A bard's history, read from Tiger Data (backend/app/tiger.py: history()). */
export interface History {
  totals: { plays: number; tries: number; hits: number; runs: number; days: number; since: string | null; minutes: number | null; victories: number };
  days: { day: string; chords: Record<string, HitsTries> }[];
  /** The last few runs, oldest first (this one last). */
  runs: { runId: string; started: string; ended: string; tries: number; hits: number; chords: Record<string, HitsTries> }[];
  changes: ChangeStat[];
  mixups: { target: string; heard: string; n: number }[];
  timing: { n: number; meanMs: number | null; medianMs: number | null; meanAbsMs: number | null };
  /** Every bard, the last 24 hours. */
  community: { bards: number; plays: number; hits: number; chords: Record<string, HitsTries> };
}

export type ServiceState = string; // "off" | "unknown" | "ok" | "error: ..."

export interface CoachResult {
  advice: Advice;
  /** Gemini wrote it, or the game's built-in tips did (no key, no network, or Gemini failed). */
  source: "gemini" | "local";
  model: string | null;
  history: History | null;
  services: { tiger: ServiceState; gemini: ServiceState } | null;
}
