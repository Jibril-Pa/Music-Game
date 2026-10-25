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
 *
 * Guitar-only gate (voices, clicks, fans, music leaking from speakers):
 *  - pitch must hold steady (speech glides; a plucked string doesn't),
 *  - the level must reach its peak fast and not keep swelling (voices swell),
 *  - the sound must still be ringing when we decide (clicks vanish at once),
 *  - onsets must stand clearly above the background noise floor, learned
 *    while you're not playing,
 *  - hearing the note/chord that was already ringing again needs a clear
 *    jump in level (a re-pluck), not just a sound on top of it,
 *  - after a few notes, sounds much quieter than your own playing are ignored.
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

  // ---- guitar-only gate
  /** A note's agreeing readings must also be this close in pitch (cents). */
  maxPitchSpreadCents: 25,
  /** The level must reach 80% of its peak this soon after the onset (a pluck is fast)... */
  noteAttackHops: 3,
  /** ...a strum spreads over a few strings. */
  chordAttackHops: 6,
  /** Don't decide while the level is still climbing by more than this factor. */
  swellRatio: 1.12,
  /** At decision time the sound must still be this fraction of its peak. */
  minSustain: 0.3,
  /** Onsets must be this many times the background level. */
  floorOnsetFactor: 3,
  /** Background level = this percentile of recent quiet hops... */
  floorPercentile: 0.2,
  /** ...over about this many hops (~5 s), only while nothing is ringing... */
  floorWindowHops: 450,
  /** ...and no onset (not even a rejected one) for this long. */
  floorQuietMs: 1500,
  /** Re-hearing what was already ringing needs the level to jump this much. */
  restrikeGain: 1.45,
  /** Ignore sounds that add less than this fraction of what your recent playing added... */
  relativeLevel: 0.3,
  /** ...once this many notes have been heard. */
  relativeAfter: 4,
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
  /** Peak level (RMS) right after the onset... */
  peakRms?: number;
  /** ...and how much louder that is than just before it. */
  rise?: number;
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
  /** Learned background level (RMS). */
  noiseFloor: number;
  /** Sounds ignored as not-guitar so far (voices, clicks, swells...). */
  ignored: number;
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
  hz: number;
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
  /** Hop levels since the current onset. */
  private env: number[] = [];
  private floorRing = new Float32Array(DETECT_CONFIG.floorWindowHops);
  private floorHfRing = new Float32Array(DETECT_CONFIG.floorWindowHops);
  private floorIdx = 0;
  private floorCount = 0;
  private floorRms = 0;
  private floorHf = 0;
  private hopsSinceFloor = 0;
  /** What recently accepted notes/chords added to the level (how hard the player plays). */
  private recentAdded: number[] = [];
  /** Level just before the current onset, and what was ringing then. */
  private preLevel = 0;
  private ringing: string | null = null;
  private ringingState: "note" | "chord" | null = null;
  private ignored = 0;
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
    this.env = [];
    this.floorIdx = this.floorCount = this.hopsSinceFloor = 0;
    this.floorRms = this.floorHf = 0;
    this.recentAdded = [];
    this.preLevel = 0;
    this.ringing = null;
    this.ringingState = null;
    this.ignored = 0;
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

    // Background level, learned only while nothing has happened for a while.
    if (this.state === "idle" && endTime - this.lastOnset >= c.floorQuietMs) {
      this.floorRing[this.floorIdx] = hopRms;
      this.floorHfRing[this.floorIdx] = hf;
      this.floorIdx = (this.floorIdx + 1) % c.floorWindowHops;
      this.floorCount = Math.min(c.floorWindowHops, this.floorCount + 1);
      if (++this.hopsSinceFloor >= 20 && this.floorCount >= 40) {
        this.hopsSinceFloor = 0;
        const pct = (a: Float32Array) => {
          const v = Array.from(a.subarray(0, this.floorCount)).sort((x, y) => x - y);
          return v[Math.floor(v.length * c.floorPercentile)];
        };
        this.floorRms = pct(this.floorRing);
        this.floorHf = pct(this.floorHfRing);
      }
    }
    const onsetMinRms = Math.max(c.onsetMinRms, this.floorRms * c.floorOnsetFactor);
    const onsetHfMin = Math.max(c.onsetHfMin, this.floorHf * c.floorOnsetFactor);

    let detection: Detection | null = null;
    const louder = hopRms > prev * c.onsetRatio && hopRms - prev >= c.onsetMinJump;
    const transient = hf >= onsetHfMin && hf > prevHf * c.onsetHfRatio;
    const onset =
      hopRms >= onsetMinRms &&
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
      this.ringingState = this.state === "note" || this.state === "chord" ? this.state : null;
      this.ringing =
        this.state === "note" ? (this.sustainPc ?? null) : this.state === "chord" ? (this.lastChordName ?? null) : null;
      this.preLevel = prev;
      this.state = "deciding";
      this.readings = [];
      this.chromaSum = null;
      this.sawConfidentPitch = false;
      this.change = null;
      this.env = [];
    }
    if (this.state === "deciding") this.env.push(hopRms);

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
        this.readings.push({ pc: pitchClassOf(midi), midi, hz, conf });
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
        noiseFloor: this.floorRms,
        ignored: this.ignored,
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
    // A clear, different chord in the plain reading wins. Only when the plain
    // reading is still the previous chord (strings ringing on) or unclear,
    // trust what's new since the onset.
    let pick = plain;
    let shown: Float32Array = avg;
    const plainIsNew = plain.ok && plain.name !== this.lastChordName;
    if (!plainIsNew && novel?.ok) {
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
    // Steady pitch, in cents: speech and sirens glide, strings don't.
    const hzs = last.map((x) => x.hz);
    if (1200 * Math.log2(Math.max(...hzs) / Math.min(...hzs)) > c.maxPitchSpreadCents) return null;
    const conf = last.reduce((s, x) => s + x.conf, 0) / last.length;
    if (conf < c.noteMeanConfidence) return null;
    const midis = last.map((x) => x.midi).sort((a, b) => a - b);
    return { pc: last[0].pc, midi: midis[midis.length >> 1], hz: hzs[0], conf };
  }

  /**
   * Last chance at the timeout: most readings agree on one pitch class (PitchYin
   * sometimes jumps to the fifth on a real string) and that pitch is steady.
   * Octave jumps are fine: steadiness is measured against the nearest semitone.
   */
  private timeoutNote(): Reading | null {
    const c = this.cfg;
    const r = this.readings;
    if (r.length < 3) return null;
    const count = new Map<PitchClass, number>();
    for (const x of r) count.set(x.pc, (count.get(x.pc) ?? 0) + 1);
    const [pc, n] = [...count].sort((a, b) => b[1] - a[1])[0];
    if (n < 0.6 * r.length) return null;
    const mine = r.filter((x) => x.pc === pc);
    const dev = mine.map((x) => 100 * (hzToMidi(x.hz) - x.midi));
    if (Math.max(...dev) - Math.min(...dev) > c.maxPitchSpreadCents) return null;
    const midis = mine.map((x) => x.midi).sort((a, b) => a - b);
    return { pc, midi: midis[midis.length >> 1], hz: mine[0].hz, conf: mine.reduce((s, x) => s + x.conf, 0) / mine.length };
  }

  /** Shape of the sound since the onset: attack time, still swelling, still ringing. */
  private envelope() {
    const env = this.env;
    const peak = env.length ? Math.max(...env) : 0;
    const attack = env.findIndex((v) => v >= 0.8 * peak);
    const last = env[env.length - 1] ?? 0;
    const swelling = env.length >= 3 && last > this.cfg.swellRatio * Math.max(...env.slice(0, -1));
    return { peak, attack, swelling, sustained: last >= this.cfg.minSustain * peak };
  }

  /** Hard enough compared to how the player has been playing? */
  private loudEnough(added: number): boolean {
    const c = this.cfg;
    if (this.recentAdded.length < c.relativeAfter) return true;
    const sorted = [...this.recentAdded].sort((a, b) => a - b);
    return added >= c.relativeLevel * sorted[sorted.length >> 1];
  }

  /** Not a guitar event: go back to whatever was ringing before it. */
  private drop(why: string) {
    this.debug?.(`  dropped: ${why}`);
    this.ignored++;
    this.state = this.ringing && this.quietHops < this.cfg.releaseHops ? this.ringingState! : "idle";
  }

  private decide(frame: Float32Array, sampleRate: number, endTime: number): Detection | null {
    const c = this.cfg;
    const elapsed = endTime - this.onsetTime;
    const env = this.envelope();
    // Still swelling (a voice, a bowed note...): wait and see.
    const waiting = env.swelling && elapsed < c.decisionTimeoutMs;
    const note = waiting ? null : this.noteCandidate();

    let d: Detection | null = null;
    if (note) {
      if (env.attack > c.noteAttackHops) return this.reject("slow attack (not a pluck)", endTime);
      if (!env.sustained) return this.reject("didn't ring on (click/tap)", endTime);
      d = { type: "note", pitchClass: note.pc, midi: note.midi, onsetTime: this.onsetTime, confidence: note.conf };
    } else if (!waiting && elapsed >= c.chordCheckMs && !this.sawConfidentPitch) {
      // Several strings ringing: PitchYin never got sure of one pitch.
      const chord = this.checkChord(frame, sampleRate);
      if (chord?.ok) {
        if (env.attack > c.chordAttackHops) return this.reject("slow attack (not a strum)", endTime);
        if (!env.sustained) return this.reject("didn't ring on (click/tap)", endTime);
        d = { type: "chord", pitchClass: pitchClassOf(GAME_CHORDS[chord.name].root), chord: chord.name, onsetTime: this.onsetTime, confidence: chord.score };
      }
    }
    if (!d && elapsed >= c.decisionTimeoutMs) {
      const late = env.swelling ? null : this.timeoutNote();
      if (late && env.attack <= c.noteAttackHops && env.sustained) {
        d = { type: "note", pitchClass: late.pc, midi: late.midi, onsetTime: this.onsetTime, confidence: late.conf, via: "timeout" };
      } else {
        // No clean note or chord in time: drop it rather than guess.
        this.drop(env.swelling ? "kept swelling (voice?)" : this.readings.length ? "pitch never steady" : "no pitch, no chord");
        return null;
      }
    }
    if (!d) return null;
    const rise = env.peak - this.preLevel;
    const gain = env.peak / Math.max(this.preLevel, c.minRms);
    // RMS of what this sound added on top of what was ringing (powers add, so
    // a soft strum over a loud ringing chord still counts for what it adds).
    const added = Math.sqrt(Math.max(0, env.peak * env.peak - this.preLevel * this.preLevel));
    const what = d.chord ?? d.pitchClass;
    this.debug?.(`  ${what}: peak ${env.peak.toFixed(3)} pre ${this.preLevel.toFixed(3)} gain ${gain.toFixed(2)} attack ${env.attack} ringing ${this.ringing}`);
    if (what === this.ringing && gain < c.restrikeGain) return this.reject("same as what was ringing, no re-pluck", endTime);
    if (!this.loudEnough(added)) return this.reject("much quieter than your playing", endTime);
    d.peakRms = env.peak;
    d.rise = rise;
    this.recentAdded.push(added);
    if (this.recentAdded.length > 8) this.recentAdded.shift();
    this.emitted(d, endTime);
    return d;
  }

  /** The last event turned out not to be the player (e.g. the game's own sound): don't learn from it. */
  retract(): void {
    this.recentAdded.pop();
  }

  private reject(why: string, endTime: number): null {
    this.drop(why);
    // Stay deaf to the rest of this sound, like after a real event.
    this.lastEvent = endTime;
    return null;
  }
}
