/**
 * Chord-to-slay rules (inspired by Magic Cat Academy): every enemy shows a
 * symbol (a chord, or a single note in the easier mode). Play it and every
 * enemy whose next symbol matches is hit. No sequences to memorise.
 *
 * Some symbols are reserved for helpers and never appear on enemies:
 *   heal  - carried by the fairy godmother
 *   super - "Happily Ever After", available when the magic meter is full
 */

import type { NoteEvent, PitchClass } from "@/lib/input/types";

export type PlayMode = "chords" | "notes";

export interface SymbolSet {
  /** Enemy symbols, in the order they are introduced. */
  enemy: string[];
  heal: string;
  super: string;
}

export const SYMBOL_SETS: Record<PlayMode, SymbolSet> = {
  // Beginner open chords, all in the music's key (E minor), so whatever you
  // play fits the background. Em and G first: the easiest shapes.
  // Heal = A major (a bright "magic" chord); super = E major, the happy ending.
  chords: { enemy: ["Em", "G", "D", "C", "Am"], heal: "A", super: "E" },
  // Open strings only (low E, A, D, G); B = heal, C (B string, 1st fret) = super.
  notes: { enemy: ["E", "A", "D", "G"], heal: "B", super: "C" },
};

/** Symbols in play at a given stage of the level (grows: 2, 3, 4, then all). */
export function enemyPool(mode: PlayMode, stage: number): string[] {
  const all = SYMBOL_SETS[mode].enemy;
  return all.slice(0, Math.min(all.length, 2 + Math.max(0, stage)));
}

/**
 * How many chords an enemy needs: its base count, plus a chance (growing
 * through the level) that any enemy is a tougher one needing 1-2 more.
 * `toughness` (harder levels) multiplies those chances.
 */
export function symbolCountFor(base: number, stage: number, rnd: () => number = Math.random, toughness = 1): number {
  const r = rnd();
  const chance2 = Math.min(0.55, [0, 0.2, 0.3, 0.35][Math.min(3, Math.max(0, stage))] * toughness);
  const chance3 = Math.min(0.3, [0, 0, 0.06, 0.12][Math.min(3, Math.max(0, stage))] * toughness);
  if (r < chance3) return base + 2;
  if (r < chance3 + chance2) return base + 1;
  return base;
}

export function randomSymbols(mode: PlayMode, stage: number, count: number, rnd: () => number = Math.random): string[] {
  const pool = enemyPool(mode, stage);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let s = pool[Math.floor(rnd() * pool.length)];
    // Avoid the same symbol twice in a row on one enemy.
    if (out.length && s === out[out.length - 1] && pool.length > 1) s = pool[(pool.indexOf(s) + 1) % pool.length];
    out.push(s);
  }
  return out;
}

const CHORD_ROOT: Record<string, PitchClass> = { Em: "E", E: "E", G: "G", C: "C", D: "D", A: "A", Am: "A" };

/** "chord" symbols are chord names in chords mode, pitch classes in notes mode. */
export function symbolKind(mode: PlayMode): "chord" | "note" {
  return mode === "chords" ? "chord" : "note";
}

/**
 * Does what the player played count as `symbol`?
 * - chords mode: the chord itself; in practice mode a single note on the
 *   chord's root also counts (for players still learning the shapes).
 * - notes mode: the note (octave ignored); a strummed chord counts as its root.
 */
export function matches(ev: Pick<NoteEvent, "type" | "pitchClass" | "chord">, symbol: string, mode: PlayMode, practice: boolean): boolean {
  if (mode === "chords") {
    if (ev.type === "chord") return ev.chord === symbol;
    return practice && CHORD_ROOT[symbol] === ev.pitchClass;
  }
  return ev.pitchClass === symbol;
}

/** What to call the input in the UI ("Em", or "E"). */
export function playedLabel(ev: Pick<NoteEvent, "type" | "pitchClass" | "chord">): string {
  return ev.type === "chord" ? (ev.chord ?? ev.pitchClass) : ev.pitchClass;
}

// ------------------------------------------------------------------ teaching

export interface Fingering {
  label: string;
  /** Single notes: where to play them (string 1 = high E). First = easiest. */
  notes?: { string: number; fret: number }[];
  /** Chords: frets from low E to high E, "x" = don't play. */
  shape?: string;
  /** Chords: which finger presses each string (1 index ... 4 pinky), same layout as `shape`. */
  fingers?: string;
}

export const CHORD_SHAPES: Record<string, string> = { Em: "022000", G: "320003", C: "x32010", D: "xx0232", E: "022100", A: "x02220", Am: "x02210" };
/** The usual beginner fingering for each shape (0 = open, x = not played). */
export const CHORD_FINGERS: Record<string, string> = { Em: "023000", G: "210003", C: "x32010", D: "xx0132", E: "023100", A: "x01230", Am: "x02310" };

/** Where every note is in the first five frets (string 6 = low E ... 1 = high e). First = easiest. */
const NOTE_SPOTS: Record<string, { string: number; fret: number }[]> = {
  C: [{ string: 2, fret: 1 }, { string: 5, fret: 3 }],
  "C#": [{ string: 2, fret: 2 }, { string: 5, fret: 4 }],
  D: [{ string: 4, fret: 0 }, { string: 2, fret: 3 }, { string: 5, fret: 5 }],
  "D#": [{ string: 4, fret: 1 }, { string: 2, fret: 4 }],
  E: [{ string: 6, fret: 0 }, { string: 1, fret: 0 }, { string: 4, fret: 2 }],
  F: [{ string: 1, fret: 1 }, { string: 6, fret: 1 }, { string: 4, fret: 3 }],
  "F#": [{ string: 1, fret: 2 }, { string: 6, fret: 2 }, { string: 4, fret: 4 }],
  G: [{ string: 3, fret: 0 }, { string: 6, fret: 3 }, { string: 1, fret: 3 }],
  "G#": [{ string: 3, fret: 1 }, { string: 6, fret: 4 }, { string: 1, fret: 4 }],
  A: [{ string: 5, fret: 0 }, { string: 3, fret: 2 }, { string: 1, fret: 5 }],
  "A#": [{ string: 5, fret: 1 }, { string: 3, fret: 3 }],
  B: [{ string: 2, fret: 0 }, { string: 5, fret: 2 }, { string: 3, fret: 4 }],
};

const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // low E .. high E

/** MIDI notes of an open-chord voicing (for the keyboard players' strum sound). */
export function chordMidis(name: string): number[] {
  const shape = CHORD_SHAPES[name];
  if (!shape) return [52];
  return [...shape].flatMap((f, i) => (f === "x" ? [] : [OPEN_STRINGS[i] + Number(f)]));
}

export function fingeringFor(symbol: string, mode: PlayMode): Fingering {
  // A chord name or a note name decides it (boss songs can ask for any note).
  if (CHORD_SHAPES[symbol] && (mode === "chords" || !NOTE_SPOTS[symbol])) return { label: symbol, shape: CHORD_SHAPES[symbol], fingers: CHORD_FINGERS[symbol] };
  return { label: symbol, notes: NOTE_SPOTS[symbol] };
}

const CHORD_PCS: Record<string, number[]> = { Em: [4, 7, 11], G: [7, 11, 2], D: [2, 6, 9], C: [0, 4, 7], Am: [9, 0, 4], A: [9, 1, 4], E: [4, 8, 11] };

/**
 * The chord (from `pool`) that best fits a moment of a song, given how much
 * of each pitch class sounds then (weights[0] = C ... weights[11] = B) and
 * the lowest note. Notes outside the chord count against it.
 */
export function bestChord(weights: number[], bass: number | null, pool: string[] = SYMBOL_SETS.chords.enemy, key?: number[]): { chord: string; score: number } {
  let best = { chord: pool[0], score: -Infinity };
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  for (const name of pool) {
    const tones = CHORD_PCS[name];
    let inside = 0;
    for (const pc of tones) inside += weights[pc];
    const outside = total - inside;
    let score = (inside - 0.7 * outside) / total;
    if (bass !== null && bass === tones[0]) score += 0.25;
    else if (bass !== null && tones.includes(bass)) score += 0.08;
    // The song's key breaks ties (E vs Em when the bar has no third).
    if (key) score += 0.3 * (tones.reduce((a, pc) => a + key[pc], 0) / tones.length);
    if (score > best.score) best = { chord: name, score };
  }
  return best;
}

/** Boss howls: a song note becomes the closest playable symbol. */
const NOTE_TO_CHORD: Record<string, string> = {
  C: "C", "C#": "Am", D: "D", "D#": "Em", E: "Em", F: "C", "F#": "D", G: "G", "G#": "Am", A: "Am", "A#": "G", B: "Em",
};
const PC_INDEX: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

export function symbolForSongNote(pc: string, mode: PlayMode): string {
  if (mode === "chords") return NOTE_TO_CHORD[pc] ?? "Em";
  // Single notes: the song's real note (any of the 12; the helper shows where it is).
  if (PC_INDEX[pc] !== undefined) return pc;
  const i = PC_INDEX[pc] ?? 4;
  let best = "E";
  let bestD = 99;
  for (const s of SYMBOL_SETS.notes.enemy) {
    const d = Math.min((i - PC_INDEX[s] + 12) % 12, (PC_INDEX[s] - i + 12) % 12);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}
