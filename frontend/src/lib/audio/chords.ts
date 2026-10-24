import { PITCH_CLASSES, computeChroma, type ChromaOptions } from "./chroma";

// ---------------------------------------------------------------------------
// Chord vocabulary

export type ChordQuality = "maj" | "min" | "7" | "maj7" | "m7" | "sus2" | "sus4";

export const QUALITIES: Record<
  ChordQuality,
  { intervals: readonly number[]; suffix: string; label: string; penalty: number }
> = {
  maj: { intervals: [0, 4, 7], suffix: "", label: "major", penalty: 0 },
  min: { intervals: [0, 3, 7], suffix: "m", label: "minor", penalty: 0 },
  "7": { intervals: [0, 4, 7, 10], suffix: "7", label: "dominant 7th", penalty: 0.04 },
  maj7: { intervals: [0, 4, 7, 11], suffix: "maj7", label: "major 7th", penalty: 0.04 },
  m7: { intervals: [0, 3, 7, 10], suffix: "m7", label: "minor 7th", penalty: 0.04 },
  sus2: { intervals: [0, 2, 7], suffix: "sus2", label: "suspended 2nd", penalty: 0.06 },
  sus4: { intervals: [0, 5, 7], suffix: "sus4", label: "suspended 4th", penalty: 0.06 },
};

export interface Chord {
  /** Pitch class of the root, 0 = C. */
  root: number;
  quality: ChordQuality;
  /** "Am", "E7", "Dsus4" */
  name: string;
  /** Pitch classes in the chord, root first. */
  pitchClasses: readonly number[];
}

export interface ChordMatch extends Chord {
  /** 0..1, higher = better fit. */
  score: number;
}

export function makeChord(root: number, quality: ChordQuality): Chord {
  const q = QUALITIES[quality];
  return {
    root,
    quality,
    name: `${PITCH_CLASSES[root]}${q.suffix}`,
    pitchClasses: q.intervals.map((i) => (root + i) % 12),
  };
}

export const ALL_CHORDS: readonly Chord[] = (Object.keys(QUALITIES) as ChordQuality[]).flatMap((q) =>
  PITCH_CLASSES.map((_, root) => makeChord(root, q)),
);

/** Note names of a chord, e.g. ["G", "B", "D"]. */
export function chordNotes(chord: Chord): string[] {
  return chord.pitchClasses.map((pc) => PITCH_CLASSES[pc]);
}

/** Same notes, ignoring root (e.g. Dsus2 and Asus4). */
export function sameNotes(a: Chord, b: Chord): boolean {
  const key = (c: Chord) => [...c.pitchClasses].sort((x, y) => x - y).join(",");
  return key(a) === key(b);
}

// ---------------------------------------------------------------------------
// Matching

export const CHORD_CONFIG = {
  /** Best match must score at least this to count as a chord. */
  minScore: 0.8,
  /** Template weight of each overtone relative to the previous one. */
  harmonicDecay: 0.5,
  /** Chroma smoothing: weight of the newest frame. */
  smoothing: 0.35,
  /** A frame this many times louder than the last one is a new strum: smoothing restarts. */
  onsetRatio: 2,
  /** A different chord must win this many frames in a row before it's shown. */
  switchFrames: 2,
  /** Keep the current chord unless the new one beats it by this much. */
  switchMargin: 0.02,
  /** Clear the chord after this many silent frames (~1 s at 48 kHz / hop 4096). */
  clearAfterFrames: 12,
} as const;

/** Harmonic number → semitones above the note's pitch class (octave-folded). */
const HARMONICS: readonly [number, number][] = [
  [1, 0], [2, 0], [3, 7], [4, 0], [5, 4], [6, 7], [7, 10], [8, 0],
];

/**
 * Expected chroma for a chord: each note plus its overtones (the 3rd harmonic
 * is a fifth up, the 5th a major third up...), each weaker than the last.
 * Real strings put energy there, so plain 0/1 templates mistake G for Gmaj7.
 */
function harmonicTemplate(pitchClasses: readonly number[]): Float64Array {
  const t = new Float64Array(12);
  for (const pc of pitchClasses) {
    for (const [h, semitones] of HARMONICS) t[(pc + semitones) % 12] += CHORD_CONFIG.harmonicDecay ** (h - 1);
  }
  return t;
}

const TEMPLATES = new Map<string, Float64Array>();
function templateFor(chord: Chord): Float64Array {
  let t = TEMPLATES.get(chord.name);
  if (!t) TEMPLATES.set(chord.name, (t = harmonicTemplate(chord.pitchClasses)));
  return t;
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Every chord in the vocabulary, best fit first. */
export function rankChords(chroma: ArrayLike<number>, chords: readonly Chord[] = ALL_CHORDS): ChordMatch[] {
  return chords
    .map((chord) => ({
      ...chord,
      score: cosine(chroma, templateFor(chord)) - QUALITIES[chord.quality].penalty,
    }))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Live tracking

export interface ChordUpdate {
  rms: number;
  /** Smoothed chroma (loudest = 1), or null during silence. */
  chroma: Float32Array | null;
  /** The chord being shown (held through short gaps), or null. */
  chord: ChordMatch | null;
  /** Top few matches for this frame. */
  candidates: ChordMatch[];
}

/**
 * Frame-by-frame chord recognizer: chroma → smoothing → template match, with
 * hysteresis so the display doesn't flicker between near-identical chords.
 */
export class ChordTracker {
  private avg: Float32Array | null = null;
  private prevRms = 0;
  private misses = 0;
  private current: ChordMatch | null = null;
  private pending: { name: string; count: number } | null = null;

  constructor(private readonly options: ChromaOptions = {}) {}

  push(frame: Float32Array, sampleRate: number): ChordUpdate {
    const cfg = CHORD_CONFIG;
    const frameChroma = computeChroma(frame, sampleRate, this.options);
    const level = frameChroma?.rms ?? 0;

    if (!frameChroma) {
      this.prevRms = 0;
      if (++this.misses >= cfg.clearAfterFrames) this.reset();
      return { rms: level, chroma: null, chord: this.current, candidates: [] };
    }
    this.misses = 0;

    // New strum → start fresh; otherwise blend into the running average.
    const onset = level > this.prevRms * cfg.onsetRatio;
    this.prevRms = level;
    if (!this.avg || onset) {
      this.avg = Float32Array.from(frameChroma.chroma);
    } else {
      for (let i = 0; i < 12; i++) {
        this.avg[i] = this.avg[i] * (1 - cfg.smoothing) + frameChroma.chroma[i] * cfg.smoothing;
      }
    }
    const max = Math.max(...this.avg);
    const chroma = this.avg.map((v) => (max > 0 ? v / max : 0));

    const ranked = rankChords(chroma);
    const best = ranked[0];
    this.updateCurrent(best, ranked);

    return { rms: level, chroma, chord: this.current, candidates: ranked.slice(0, 3) };
  }

  private updateCurrent(best: ChordMatch, ranked: ChordMatch[]) {
    const cfg = CHORD_CONFIG;
    if (best.score < cfg.minScore) {
      this.pending = null;
      return;
    }
    if (this.current) {
      const stillThere = ranked.find((m) => m.name === this.current!.name);
      if (best.name === this.current.name || (stillThere && best.score - stillThere.score < cfg.switchMargin)) {
        this.current = stillThere ?? best;
        this.pending = null;
        return;
      }
    }
    this.pending = this.pending?.name === best.name ? { name: best.name, count: this.pending.count + 1 } : { name: best.name, count: 1 };
    if (this.pending.count >= cfg.switchFrames) {
      this.current = best;
      this.pending = null;
    }
  }

  reset(): void {
    this.avg = null;
    this.prevRms = 0;
    this.misses = 0;
    this.current = null;
    this.pending = null;
  }
}
