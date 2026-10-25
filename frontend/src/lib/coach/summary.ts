/**
 * What a run looked like to the coach: per chord, per chord change, and on the beat. The same
 * rules as the SQL in backend/app/tiger.py, so this run and the history in Tiger Data line up.
 */

import { RHYTHM_CONFIG } from "@/lib/combat/rhythm";
import { CHORD_PCS, type PlayMode } from "@/lib/combat/spells";
import { PITCH_CLASSES, type InputSource } from "@/lib/input/types";
import type { ChangeStat, ChordStat, PlayRecord, RunSummary } from "./types";

const pcOf = (name: string): number => PITCH_CLASSES.indexOf(name as (typeof PITCH_CLASSES)[number]);

/** A single note heard in chords mode, told apart from the chord of the same name ("E note" vs "E"). */
export const NOTE_SUFFIX = " note";

/** Pitch classes a symbol stands for: a chord's notes, or the note itself. */
function pitchClasses(symbol: string, mode: PlayMode): number[] {
  if (symbol.endsWith(NOTE_SUFFIX)) {
    const pc = pcOf(symbol.slice(0, -NOTE_SUFFIX.length));
    return pc >= 0 ? [pc] : [];
  }
  if (mode === "chords" && CHORD_PCS[symbol]) return CHORD_PCS[symbol];
  const pc = pcOf(symbol);
  return pc >= 0 ? [pc] : (CHORD_PCS[symbol] ?? []);
}

/**
 * Which of `wanted` the player was most likely going for when they played `played`: the one sharing
 * the most notes with it (C wanted, Am heard: they share C and E), else the nearest note. A miss is
 * then "C heard as Am", which says which finger slipped.
 */
export function guessTarget(played: string, wanted: string[], mode: PlayMode): string | null {
  if (!wanted.length) return null;
  if (wanted.includes(played)) return played;
  const p = pitchClasses(played, mode);
  let best = wanted[0];
  let bestScore = -Infinity;
  for (const w of wanted) {
    const q = pitchClasses(w, mode);
    const shared = q.filter((x) => p.includes(x)).length;
    // Ties: the closest root (semitones round the circle), then the order the game listed them in.
    const d = p.length && q.length ? Math.min(...p.map((a) => Math.min(...q.map((b) => Math.min((a - b + 12) % 12, (b - a + 12) % 12))))) : 6;
    const score = shared * 10 - d;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  return best;
}

/** Most of the run's inputs came from here. */
function mainInput(plays: PlayRecord[], fallback: InputSource): InputSource {
  const mic = plays.filter((p) => p.input === "mic").length;
  if (!plays.length) return fallback;
  return mic * 2 >= plays.length ? "mic" : "keyboard";
}

export interface RunContext {
  levels: string[];
  world: string;
  victory: boolean;
  seconds: number;
  mode: PlayMode;
  input: InputSource;
  practice: boolean;
  slain: number;
  maxCombo: number;
}

export function summarizeRun(plays: PlayRecord[], ctx: RunContext): RunSummary {
  const aimed = plays.filter((p) => p.target !== null);
  const chords = new Map<string, ChordStat>();
  const changes = new Map<string, ChangeStat>();
  let prev: PlayRecord | null = null;
  for (const p of aimed) {
    const target = p.target!;
    let c = chords.get(target);
    if (!c) chords.set(target, (c = { chord: target, tries: 0, hits: 0, heardAs: {} }));
    c.tries++;
    if (p.hit) c.hits++;
    else if (p.input === "mic" && p.played !== target) c.heardAs[p.played] = (c.heardAs[p.played] ?? 0) + 1;
    // Right after landing one chord, the next wants another: did the first strum land it?
    if (prev?.hit && prev.target !== target) {
      const key = `${prev.target}>${target}`;
      let ch = changes.get(key);
      if (!ch) changes.set(key, (ch = { from: prev.target!, to: target, changes: 0, firstTry: 0 }));
      ch.changes++;
      if (p.hit) ch.firstTry++;
    }
    prev = p;
  }
  const timed = aimed.filter((p) => p.hit && p.offsetMs !== null);
  const off = RHYTHM_CONFIG.perfectMs;
  return {
    levels: ctx.levels,
    world: ctx.world,
    victory: ctx.victory,
    seconds: Math.round(ctx.seconds),
    mode: ctx.mode,
    input: mainInput(plays, ctx.input),
    practice: ctx.practice,
    tries: aimed.length,
    hits: aimed.filter((p) => p.hit).length,
    perfects: aimed.filter((p) => p.hit && p.grade === "perfect").length,
    slain: ctx.slain,
    maxCombo: ctx.maxCombo,
    chords: [...chords.values()].sort((a, b) => b.tries - b.hits - (a.tries - a.hits) || b.tries - a.tries),
    changes: [...changes.values()].sort((a, b) => a.firstTry / a.changes - b.firstTry / b.changes || b.changes - a.changes),
    timing: timed.length
      ? {
          n: timed.length,
          meanMs: Math.round(timed.reduce((s, p) => s + p.offsetMs!, 0) / timed.length),
          earlyShare: timed.filter((p) => p.offsetMs! < -off).length / timed.length,
          lateShare: timed.filter((p) => p.offsetMs! > off).length / timed.length,
        }
      : null,
  };
}
