/**
 * Data-driven moves and the combo matcher. Retune anything here.
 *
 * Rules:
 *  - Every input immediately fires Lute Strike (responsive), unless it
 *    completes a special, which cancels into the special instead.
 *  - A special matches when its inputs are the most recent inputs, in order,
 *    with no gap longer than `maxGapMs`. The longest match wins.
 *  - Wrong notes just drop the start of the buffer; nothing is punished.
 *  - The buffer survives a completed special while a longer special could
 *    still follow (E G = fireball, keep going A B D E = super).
 */

import type { ChordName, NoteEvent, PitchClass } from "@/lib/input/types";

export type ComboInput = { kind: "note"; pc: PitchClass } | { kind: "chord"; chord: ChordName };

export type MoveId =
  | "luteStrike"
  | "wolfBane"
  | "dragonsBreath"
  | "beanstalk"
  | "glassSlipper"
  | "godmother"
  | "happilyEverAfter";

export type MoveKind = "jab" | "slash" | "projectile" | "launcher" | "shield" | "heal" | "super";

/** One step of a move, for the Spellbook's fretboard diagram. */
export interface Fingering {
  label: string;
  /** Single notes: where to play them (string 1 = high E). */
  notes?: { string: number; fret: number }[];
  /** Chords: frets from low E to high E, "x" = don't play. */
  shape?: string;
}

export interface MoveDef {
  id: MoveId;
  name: string;
  kind: MoveKind;
  /** null = any single note or chord (Lute Strike). */
  inputs: ComboInput[] | null;
  description: string;
  damage: number;
  /** Melee reach in px in front of the hero. */
  range: number;
  knockback: number;
  /** Upward launch speed (px/s). */
  launch: number;
  hitStopMs: number;
  /** Camera shake intensity (0..0.03). */
  shake: number;
  /** Magic gained per enemy hit (before rhythm bonus). */
  magicGain: number;
  durationMs?: number;
  healPct?: number;
  requiresFullMagic?: boolean;
  color: number;
  fingering: Fingering[];
}

const n = (pc: PitchClass): ComboInput => ({ kind: "note", pc });
const c = (chord: ChordName): ComboInput => ({ kind: "chord", chord });

// Open strings make every combo playable on day one.
const OPEN: Record<string, Fingering> = {
  E: { label: "E", notes: [{ string: 6, fret: 0 }, { string: 1, fret: 0 }, { string: 4, fret: 2 }] },
  G: { label: "G", notes: [{ string: 3, fret: 0 }, { string: 6, fret: 3 }, { string: 1, fret: 3 }] },
  A: { label: "A", notes: [{ string: 5, fret: 0 }, { string: 3, fret: 2 }, { string: 1, fret: 5 }] },
  B: { label: "B", notes: [{ string: 2, fret: 0 }, { string: 5, fret: 2 }, { string: 3, fret: 4 }] },
  D: { label: "D", notes: [{ string: 4, fret: 0 }, { string: 2, fret: 3 }, { string: 5, fret: 5 }] },
};
export const CHORD_SHAPES: Record<string, string> = { Em: "022000", G: "320003", C: "x32010", D: "xx0232", E: "022100", A: "x02220", Am: "x02210" };
const CH = (name: ChordName): Fingering => ({ label: name, shape: CHORD_SHAPES[name] });

export const MOVES: MoveDef[] = [
  {
    id: "luteStrike",
    name: "Lute Strike",
    kind: "jab",
    inputs: null,
    description: "Any single note: a quick jab. Fires instantly, then cancels into a special if your next notes finish one.",
    damage: 8,
    range: 110,
    knockback: 160,
    launch: 0,
    hitStopMs: 0,
    shake: 0,
    magicGain: 2,
    color: 0xfff1b5,
    fingering: [{ label: "any note", notes: [{ string: 6, fret: 0 }, { string: 5, fret: 0 }, { string: 4, fret: 0 }, { string: 3, fret: 0 }, { string: 2, fret: 0 }, { string: 1, fret: 0 }] }],
  },
  {
    id: "wolfBane",
    name: "Wolf-Bane Slash",
    kind: "slash",
    inputs: [n("E"), n("A")],
    description: "A forward slash that knocks enemies back.",
    damage: 22,
    range: 170,
    knockback: 560,
    launch: 180,
    hitStopMs: 70,
    shake: 0.006,
    magicGain: 6,
    color: 0xbfe8ff,
    fingering: [OPEN.E, OPEN.A],
  },
  {
    id: "dragonsBreath",
    name: "Dragon's Breath",
    kind: "projectile",
    inputs: [n("E"), n("G")],
    description: "A fireball that flies across the screen and burns everything in its path.",
    damage: 26,
    range: 0,
    knockback: 340,
    launch: 120,
    hitStopMs: 60,
    shake: 0.008,
    magicGain: 7,
    color: 0xff8a3d,
    fingering: [OPEN.E, OPEN.G],
  },
  {
    id: "beanstalk",
    name: "Beanstalk Rise",
    kind: "launcher",
    inputs: [n("A"), n("B"), n("D"), n("E")],
    description: "An uppercut that launches the enemy sky-high, like a magic beanstalk.",
    damage: 34,
    range: 140,
    knockback: 140,
    launch: 900,
    hitStopMs: 110,
    shake: 0.012,
    magicGain: 8,
    color: 0x8fe36a,
    fingering: [OPEN.A, OPEN.B, OPEN.D, OPEN.E],
  },
  {
    id: "glassSlipper",
    name: "Glass Slipper Guard",
    kind: "shield",
    inputs: [c("Em")],
    description: "Strum Em: a crystal shield blocks all damage while the chord rings (~1.5 s).",
    damage: 0,
    range: 0,
    knockback: 0,
    launch: 0,
    hitStopMs: 0,
    shake: 0,
    magicGain: 0,
    durationMs: 1500,
    color: 0xc6f3ff,
    fingering: [CH("Em")],
  },
  {
    id: "godmother",
    name: "Godmother's Grace",
    kind: "heal",
    inputs: [c("G"), c("C"), c("D")],
    description: "Strum G, C, D: heals 20% of your health.",
    damage: 0,
    range: 0,
    knockback: 0,
    launch: 0,
    hitStopMs: 0,
    shake: 0,
    magicGain: 0,
    healPct: 0.2,
    color: 0xffd6f2,
    fingering: [CH("G"), CH("C"), CH("D")],
  },
  {
    id: "happilyEverAfter",
    name: "Happily Ever After",
    kind: "super",
    inputs: [n("E"), n("G"), n("A"), n("B"), n("D"), n("E")],
    description: "With a full magic meter, climb the E minor pentatonic (E G A B D E): a storybook finisher that clears the screen.",
    damage: 999,
    range: 0,
    knockback: 600,
    launch: 600,
    hitStopMs: 200,
    shake: 0.025,
    magicGain: 0,
    requiresFullMagic: true,
    color: 0xffe066,
    fingering: [OPEN.E, OPEN.G, OPEN.A, OPEN.B, OPEN.D, { label: "E", notes: [{ string: 1, fret: 0 }, { string: 4, fret: 2 }] }],
  },
];

export const MOVE_BY_ID = Object.fromEntries(MOVES.map((m) => [m.id, m])) as Record<MoveId, MoveDef>;
const SPECIALS = MOVES.filter((m) => m.inputs !== null) as (MoveDef & { inputs: ComboInput[] })[];
const MAX_LEN = Math.max(...SPECIALS.map((m) => m.inputs.length));

export const COMBO_CONFIG = {
  /** Longest pause allowed between two inputs of a combo. */
  maxGapMs: 700,
  /** Practice mode (Spellbook toggle). */
  practiceMaxGapMs: 1200,
};

export interface ComboContext {
  magicFull: boolean;
  practice: boolean;
}

export interface ComboResult {
  move: MoveDef;
  isSpecial: boolean;
  /** Inputs that formed the special. */
  matched: NoteEvent[];
}

export interface ComboProgress {
  /** Inputs that are part of a combo in progress. */
  inputs: NoteEvent[];
  /** Specials these inputs could still become, with what's left to play. */
  next: { move: MoveDef; done: number; remaining: ComboInput[] }[];
}

export function inputMatches(input: ComboInput, ev: Pick<NoteEvent, "type" | "pitchClass" | "chord">): boolean {
  return input.kind === "note" ? ev.type === "note" && ev.pitchClass === input.pc : ev.type === "chord" && ev.chord === input.chord;
}

export function inputLabel(input: ComboInput): string {
  return input.kind === "note" ? input.pc : input.chord;
}

export class ComboEngine {
  private buffer: NoteEvent[] = [];

  reset(): void {
    this.buffer = [];
  }

  private gap(ctx: ComboContext) {
    return ctx.practice ? COMBO_CONFIG.practiceMaxGapMs : COMBO_CONFIG.maxGapMs;
  }

  private suffixMatches(inputs: ComboInput[], len: number): boolean {
    if (this.buffer.length < len) return false;
    const suffix = this.buffer.slice(-len);
    return suffix.every((ev, i) => inputMatches(inputs[i], ev));
  }

  push(ev: NoteEvent, ctx: ComboContext): ComboResult {
    const last = this.buffer.at(-1);
    if (last && ev.time - last.time > this.gap(ctx)) this.buffer = [];
    this.buffer.push(ev);
    if (this.buffer.length > MAX_LEN) this.buffer.shift();

    // Longest eligible special completed by this input.
    let best: (MoveDef & { inputs: ComboInput[] }) | null = null;
    for (const m of SPECIALS) {
      if (m.requiresFullMagic && !ctx.magicFull) continue;
      if (this.suffixMatches(m.inputs, m.inputs.length) && (!best || m.inputs.length > best.inputs.length)) best = m;
    }
    const matched = best ? this.buffer.slice(-best.inputs.length) : [];

    // Keep only the longest suffix that could still grow into a longer special.
    let keep = 0;
    for (let len = this.buffer.length; len >= 1 && !keep; len--) {
      if (SPECIALS.some((m) => m.inputs.length > len && this.suffixMatches(m.inputs.slice(0, len), len))) keep = len;
    }
    this.buffer = keep ? this.buffer.slice(-keep) : [];

    return best ? { move: best, isSpecial: true, matched } : { move: MOVE_BY_ID.luteStrike, isSpecial: false, matched: [ev] };
  }

  /** What the player is in the middle of (for the HUD). */
  progress(ctx: ComboContext, now: number = performance.now()): ComboProgress {
    const last = this.buffer.at(-1);
    if (!last || now - last.time > this.gap(ctx)) return { inputs: [], next: [] };
    const next: ComboProgress["next"] = [];
    let longest = 0;
    for (const m of SPECIALS) {
      for (let len = Math.min(this.buffer.length, m.inputs.length - 1); len >= 1; len--) {
        if (this.suffixMatches(m.inputs.slice(0, len), len)) {
          next.push({ move: m, done: len, remaining: m.inputs.slice(len) });
          longest = Math.max(longest, len);
          break;
        }
      }
    }
    next.sort((a, b) => b.done - a.done || a.remaining.length - b.remaining.length);
    return { inputs: this.buffer.slice(-longest), next };
  }
}
