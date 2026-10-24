/**
 * Frame-by-frame onset → note / chord decision for the mic (no I/O here).
 *
 * Each frame is the newest `frameSize` samples, posted every `hopSize`
 * samples (~11 ms at 48 kHz). Per onset exactly one event is emitted:
 *
 *  1. Onset = the newest hop has a burst of high-frequency energy (the pick
 *     transient) or is clearly louder than the hops before it. The transient
 *     test still works when new strings are struck over ringing ones.
 *     Sustained notes never re-trigger.
 *  2. While deciding, PitchYin runs every hop on audio from after the onset
 *     only (at least ~32 ms of it; earlier windows still hold the previous
 *     note). Two agreeing, confident readings = a single note (~45 ms).
 *  3. Several strings at once make PitchYin unsure. If it never gets a
 *     confident reading, chroma (Essentia HPCP, averaged over a few hops once
 *     the strum has finished, ~75 ms) is matched against the game's chord
 *     templates; a chord is emitted only if it's clearly ahead of the
 *     runner-up.
 *  4. While a single note rings, a confident change of pitch class for a few
 *     hops (hammer-on / slide) is also a new note.
 */

import { computeChroma } from "@/lib/audio/chroma";
import { makeChord, rankChords, type Chord } from "@/lib/audio/chords";
import { detectPitch, hzToMidi, rms } from "@/lib/audio/pitch";
import { GAME_CHORD_NAMES, pitchClassOf, type ChordName, type PitchClass } from "./types";

export const DETECT_CONFIG = {
  frameSize: 4096,
  hopSize: 512,
  /** PitchYin window (newest samples). 2048 @ 48 kHz = 43 ms, enough for low E. */
  pitchFrame: 2048,
  /** Below this the input counts as silence. */
  minRms: 0.006,
  /** An onset needs at least this level... */
  onsetMinRms: 0.012,
  /** ...and to be this many times louder than the previous hops... */
  onsetRatio: 1.6,
  /** ...and louder by at least this much (ignores tiny relative jumps in noise). */
  onsetMinJump: 0.005,
  /** Or: high-frequency energy (first difference) this many times the previous hops' max... */
  onsetHfRatio: 2.5,
  /** ...and at least this much of it. */
  onsetHfMin: 0.008,
  /** No two events closer than this. */
  debounceMs: 120,
  /** PitchYin readings below this confidence are ignored. Chords stay below ~0.7
   * (an open D chord is the highest: its notes are almost all overtones of D). */
  noteConfidence: 0.78,
  /** Agreeing readings needed for a note... */
  stableReadings: 2,
  /** ...with at least this mean confidence. Single notes measure 0.83-1.0. */
  noteMeanConfidence: 0.83,
  /** Only analyse pitch once this much audio after the onset is available. */
  minPitchWindowMs: 32,
  /** Start checking for a chord this long after the onset (strum finished). */
  chordCheckMs: 72,
  /** Decide (or give up) this long after the onset. */
  decisionTimeoutMs: 140,
  /** Chord template match (cosine, 0..1) needed... */
  chordMinScore: 0.72,
  /** ...and lead over the second-best chord ("clearly ahead"). */
  chordMargin: 0.02,
  /** Subtract this much of the pre-onset chroma (strings still ringing from the last chord). */
  chordPreWeight: 0.5,
  /** Hops of a new, confident pitch class while a note rings = new note (legato)... */
  pitchChangeHops: 4,
  /** ...at this confidence... */
  pitchChangeConfidence: 0.9,
  /** ...and only 1-4 semitones away (hammer-ons, pull-offs, slides). Bigger jumps
   * while a note decays are almost always PitchYin sub-harmonic errors. */
  pitchChangeMaxSemitones: 4,
  minHz: 70,
  maxHz: 1100,
  /** Hops of silence before a ringing note is considered over. */
  releaseHops: 6,
} as const;

export type DetectConfig = typeof DETECT_CONFIG;

export const GAME_CHORDS: Record<ChordName, Chord> = {
  Em: makeChord(4, "min"),
  E: makeChord(4, "maj"),
  G: makeChord(7, "maj"),
  C: makeChord(0, "maj"),
  D: makeChord(2, "maj"),
  A: makeChord(9, "maj"),
  Am: makeChord(9, "min"),
};
const CHORD_LIST = GAME_CHORD_NAMES.map((n) => GAME_CHORDS[n]);

export interface Detection {
  type: "note" | "chord";
  pitchClass: PitchClass;
  midi?: number;
  chord?: ChordName;
  /** performance.now() ms */
  onsetTime: number;
  confidence: number;
  /** What triggered it (debugging). */
  via?: "onset" | "legato" | "timeout";
}

export interface DetectorDiag {
  rms: number;
  hz: number | null;
  pitchConfidence: number;
  state: "idle" | "deciding" | "note" | "chord";
  chroma: Float32Array | null;
  bestChord: { name: string; score: number } | null;
  secondChord: { name: string; score: number } | null;
}

interface Reading {
  pc: PitchClass;
  midi: number;
  conf: number;
}

interface ChordCheck {
  name: ChordName;
  score: number;
  margin: number;
  ok: boolean;
}

export class NoteDetector {
  private prevHops: number[] = [];
  private prevHf: number[] = [];
  private sustainMidi = 0;
  private lastOnset = -Infinity;
  private lastEvent = -Infinity;
  private state: DetectorDiag["state"] = "idle";
  private onsetTime = 0;
  private readings: Reading[] = [];
  private chromaSum: Float32Array | null = null;
  private preChroma: Float32Array | null = null;
  private lastChordName: ChordName | null = null;
  private sawConfidentPitch = false;
  private sustainPc: PitchClass | null = null;
  private change: { pc: PitchClass; count: number; midi: number } | null = null;
  private quietHops = 0;
  private lastChroma: Float32Array | null = null;
  private lastRank: { name: string; score: number }[] = [];

  /** Optional trace hook (bench / debugging). */
  debug: ((msg: string) => void) | null = null;

  constructor(private readonly cfg: DetectConfig = DETECT_CONFIG) {}

  reset(): void {
    this.prevHops = [];
    this.prevHf = [];
    this.lastOnset = this.lastEvent = -Infinity;
    this.state = "idle";
    this.readings = [];
    this.chromaSum = null;
    this.sawConfidentPitch = false;
    this.sustainPc = null;
    this.change = null;
    this.quietHops = 0;
  }

  /**
   * @param frame newest `frameSize` samples
   * @param endTime performance.now() ms of the frame's last sample
   */
  push(frame: Float32Array, sampleRate: number, endTime: number): { detection: Detection | null; diag: DetectorDiag } {
    const c = this.cfg;
    const hopMs = (c.hopSize / sampleRate) * 1000;
    const hop = frame.subarray(frame.length - c.hopSize);
    const hopRms = rms(hop);
    let hfSum = 0;
    for (let i = 1; i < hop.length; i++) {
      const dv = hop[i] - hop[i - 1];
      hfSum += dv * dv;
    }
    const hf = Math.sqrt(hfSum / (hop.length - 1));
    const prev = this.prevHops.length ? Math.max(...this.prevHops) : 0;
    const prevHf = this.prevHf.length ? Math.max(...this.prevHf) : 0;
    this.prevHops.push(hopRms);
    this.prevHf.push(hf);
    if (this.prevHops.length > 3) this.prevHops.shift();
    if (this.prevHf.length > 3) this.prevHf.shift();

    let detection: Detection | null = null;
    const louder = hopRms > prev * c.onsetRatio && hopRms - prev >= c.onsetMinJump;
    const transient = hf >= c.onsetHfMin && hf > prevHf * c.onsetHfRatio;
    const onset =
      hopRms >= c.onsetMinRms &&
      (louder || transient) &&
      endTime - this.lastOnset >= c.debounceMs &&
      endTime - this.lastEvent >= c.debounceMs;
    if (onset) {
      this.debug?.(`onset @${(endTime / 1000).toFixed(3)} rms ${hopRms.toFixed(3)} prev ${prev.toFixed(3)} (was ${this.state})`);
      this.lastOnset = endTime;
      this.onsetTime = endTime - hopMs / 2;
      // What was ringing just before this onset (the 4096 frame ends at the onset).
      this.preChroma = this.state === "chord" || this.state === "note"
        ? (computeChroma(frame.subarray(0, frame.length - c.hopSize), sampleRate, { minRms: c.minRms })?.chroma ?? null)
        : null;
      this.state = "deciding";
      this.readings = [];
      this.chromaSum = null;
      this.sawConfidentPitch = false;
      this.change = null;
    }

    if (hopRms < c.minRms) {
      if (++this.quietHops >= c.releaseHops && this.state !== "deciding") {
        this.state = "idle";
        this.sustainPc = null;
      }
    } else {
      this.quietHops = 0;
    }

    // Pitch every hop while there is sound (also feeds the tuner). While
    // deciding, analyse only audio from after the onset.
    let hz: number | null = null;
    let conf = 0;
    let window: number = c.pitchFrame;
    if (this.state === "deciding") {
      const since = Math.round(((endTime - this.onsetTime) / 1000) * sampleRate);
      window = since >= Math.round((c.minPitchWindowMs / 1000) * sampleRate) ? Math.min(c.pitchFrame, since) : 0;
    }
    if (hopRms >= c.minRms && window > 0) {
      const reading = detectPitch(frame.subarray(frame.length - window), sampleRate, {
        minConfidence: 0,
        minRms: c.minRms,
        minFrequency: c.minHz,
        maxFrequency: c.maxHz,
      });
      if (reading) {
        hz = reading.hz;
        conf = reading.confidence;
      }
    }

    if (this.state === "deciding") {
      if (hz !== null && conf >= c.noteConfidence) {
        const midi = Math.round(hzToMidi(hz));
        this.readings.push({ pc: pitchClassOf(midi), midi, conf });
        this.sawConfidentPitch = true;
      }
      detection = this.decide(frame, sampleRate, endTime);
    } else if (this.state === "note" && hz !== null && conf >= c.pitchChangeConfidence && this.sustainPc) {
      const midi = Math.round(hzToMidi(hz));
      const pc = pitchClassOf(midi);
      const interval = Math.abs(midi - this.sustainMidi);
      if (pc !== this.sustainPc && interval >= 1 && interval <= c.pitchChangeMaxSemitones) {
        this.change = this.change?.pc === pc ? { ...this.change, count: this.change.count + 1 } : { pc, count: 1, midi };
        if (this.change.count >= c.pitchChangeHops && endTime - this.lastEvent >= c.debounceMs) {
          detection = {
            type: "note",
            pitchClass: pc,
            midi: this.change.midi,
            onsetTime: endTime - hopMs * c.pitchChangeHops,
            confidence: conf,
            via: "legato",
          };
          this.emitted(detection, endTime);
        }
      } else {
        this.change = null;
      }
    }

    const [best, second] = this.lastRank;
    return {
      detection,
      diag: {
        rms: hopRms,
        hz,
        pitchConfidence: conf,
        state: this.state,
        chroma: this.lastChroma,
        bestChord: best ?? null,
        secondChord: second ?? null,
      },
    };
  }

  private emitted(d: Detection, endTime: number) {
    this.lastEvent = endTime;
    this.state = d.type;
    this.sustainPc = d.type === "note" ? d.pitchClass : null;
    this.lastChordName = d.type === "chord" ? (d.chord ?? null) : null;
    this.sustainMidi = d.midi ?? 0;
    this.change = null;
  }

  private rank(chroma: Float32Array): ChordCheck {
    const c = this.cfg;
    const ranked = rankChords(chroma, CHORD_LIST);
    const [best, second] = ranked;
    const margin = best.score - (second?.score ?? 0);
    return {
      name: best.name as ChordName,
      score: best.score,
      margin,
      ok: best.score >= c.chordMinScore && margin >= c.chordMargin,
    };
  }

  /**
   * Adds this hop's chroma to the running sum and matches the average. If a
   * chord or note was ringing before the onset, also matches only the *new*
   * energy (average minus part of the pre-onset chroma): that finds chord
   * changes over ringing strings, while a re-strum of the same chord is
   * recognised from the plain average.
   */
  private checkChord(frame: Float32Array, sampleRate: number): ChordCheck | null {
    const c = this.cfg;
    const chroma = computeChroma(frame, sampleRate, { minRms: c.minRms });
    if (!chroma) return null;
    if (!this.chromaSum) this.chromaSum = Float32Array.from(chroma.chroma);
    else for (let i = 0; i < 12; i++) this.chromaSum[i] += chroma.chroma[i];
    const norm = (a: Float32Array) => {
      const m = Math.max(...a);
      return a.map((v) => (m > 0 ? v / m : 0));
    };
    const avg = norm(this.chromaSum);
    const plain = this.rank(avg);
    let novel: ChordCheck | null = null;
    let novelChroma: Float32Array | null = null;
    if (this.preChroma) {
      const pre = this.preChroma;
      novelChroma = norm(avg.map((v, i) => Math.max(0, v - c.chordPreWeight * pre[i])));
      novel = this.rank(novelChroma);
    }
    let pick = plain;
    let shown: Float32Array = avg;
    if (!(plain.ok && plain.name === this.lastChordName) && novel?.ok) {
      pick = novel;
      shown = novelChroma!;
    }
    this.lastChroma = shown;
    const ranked = rankChords(shown, CHORD_LIST);
    this.lastRank = ranked.slice(0, 2).map((r) => ({ name: r.name, score: r.score }));
    return pick;
  }

  private noteCandidate(): Reading | null {
    const c = this.cfg;
    const r = this.readings;
    if (r.length < c.stableReadings) return null;
    const last = r.slice(-c.stableReadings);
    if (!last.every((x) => x.pc === last[0].pc)) return null;
    const conf = last.reduce((s, x) => s + x.conf, 0) / last.length;
    if (conf < c.noteMeanConfidence) return null;
    const midis = last.map((x) => x.midi).sort((a, b) => a - b);
    return { pc: last[0].pc, midi: midis[midis.length >> 1], conf };
  }

  private decide(frame: Float32Array, sampleRate: number, endTime: number): Detection | null {
    const c = this.cfg;
    const elapsed = endTime - this.onsetTime;
    const note = this.noteCandidate();

    let d: Detection | null = null;
    if (note) {
      d = { type: "note", pitchClass: note.pc, midi: note.midi, onsetTime: this.onsetTime, confidence: note.conf };
    } else if (elapsed >= c.chordCheckMs && !this.sawConfidentPitch) {
      // Several strings ringing: PitchYin never got sure of one pitch.
      const chord = this.checkChord(frame, sampleRate);
      if (chord?.ok) {
        d = { type: "chord", pitchClass: pitchClassOf(GAME_CHORDS[chord.name].root), chord: chord.name, onsetTime: this.onsetTime, confidence: chord.score };
      }
    }
    if (!d && elapsed >= c.decisionTimeoutMs) {
      if (this.readings.length) {
        // Most common pitch class among the confident readings.
        const counts = new Map<PitchClass, Reading[]>();
        for (const r of this.readings) counts.set(r.pc, [...(counts.get(r.pc) ?? []), r]);
        const [pc, rs] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
        d = { type: "note", pitchClass: pc, midi: rs[0].midi, onsetTime: this.onsetTime, confidence: rs[0].conf };
      } else {
        this.state = "idle"; // nothing clear enough: drop this onset rather than guess
      }
    }
    if (d) this.emitted(d, endTime);
    return d;
  }
}
