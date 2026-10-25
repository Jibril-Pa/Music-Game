/**
 * Ignores mic events that are really the game's own sound coming back from
 * the speakers.
 *
 * The game measures its own output level (outputLog). At each pitched sound
 * the game starts while you're not playing (only pitched sounds can pass for
 * notes, and speakers pass drums and notes differently), this compares the
 * jump in the mic's level with the jump in the game's, and learns how much of
 * the game reaches the mic (the "coupling": ~0 with headphones). Jumps, not
 * levels: your ringing guitar only decays, so it doesn't fool the
 * measurement. Jumps are in power (sounds add as power, not RMS), as the RMS
 * of the *new* sound.
 *
 * A mic event is an echo when a game sound starts with it and the sound it
 * adds is no louder than what that game sound would add at the mic. The bar
 * is a bit higher when it matches what the game is playing.
 *
 * Both sides are measured the same way: bass cut below ~200 Hz (speakers
 * differ most in how much bass they play, laptop ones play almost none), and
 * RMS over ~43 ms (4 hops), so low notes, whose waves are longer than one
 * hop, don't make the level ripple.
 */

import { LEVEL_HIGHPASS_HZ, LEVEL_HOPS, outputLevels, outputOnsets, outputSounding } from "@/lib/audio/outputLog";
import { GAME_CHORDS, type Detection } from "./detector";
import { PITCH_CLASSES } from "./types";

export const ECHO_CONFIG = {
  /** Learning: windows around a game sound's logged start (ms): the level before it... */
  preFromMs: -150,
  preToMs: -40,
  /** ...and its peak just after (wide: output-latency estimates are rough). */
  postFromMs: -40,
  postToMs: 120,
  /** Learn only at game sounds with none of your playing (echoes are fine) from this long before... */
  learnClearBeforeMs: 170,
  /** ...to this long after (playing outside the windows above can't spoil a measurement)... */
  learnClearAfterMs: 140,
  /** ...that make the game's output jump by at least this much (RMS). */
  minOutputRise: 0.02,
  /** Measurements needed before ignoring anything... */
  minSamples: 5,
  /** ...and how many recent ones to keep. */
  maxSamples: 60,
  /** Coupling = this percentile of the mic-jump / game-jump ratios (on the high side: a decaying guitar and timing jitter only make jumps look smaller). */
  couplingPercentile: 0.7,
  /**
   * Checking an event: only a game sound starting within this many ms of the
   * mic onset can be its echo (latency estimates are off by a few tens of
   * ms). One that started earlier has already been heard before the onset.
   */
  alignMs: 45,
  /** Its jump: the level before it starts (relative to its logged start, ms)... */
  checkPreFromMs: -70,
  checkPreToMs: -10,
  /** ...vs its (smoothed) peak. */
  checkPostFromMs: -10,
  checkPostToMs: 100,
  /** Echo if the sound the event adds <= factor x what the game sound adds: the game plays these notes... */
  matchFactor: 1.25,
  /** ...the game plays a recorded song (notes unknown, so be stricter)... */
  unknownFactor: 1.05,
  /** ...other notes. */
  otherFactor: 1.15,
} as const;

export type EchoConfig = { [K in keyof typeof ECHO_CONFIG]: number };

/** RMS of a new sound that took the level from `before` to `peak` (powers add). */
function newSound(peak: number, before: number): number {
  return Math.sqrt(Math.max(0, peak * peak - before * before));
}

/** Peak just after vs the lowest level before (sounds decay, so that's closest to the level just before). */
function jump(pre: number[], post: number[]): number | null {
  return pre.length && post.length ? newSound(Math.max(...post), Math.min(...pre)) : null;
}

/** 2nd-order Butterworth high-pass, the same as the game's output tap (a BiquadFilterNode). */
class Highpass {
  private sr = 0;
  private b = [0, 0, 0];
  private a = [0, 0];
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  /** RMS of the filtered block (the filter's state carries over between blocks). */
  rms(x: Float32Array, sampleRate: number): number {
    if (sampleRate !== this.sr) {
      this.sr = sampleRate;
      const w = (2 * Math.PI * LEVEL_HIGHPASS_HZ) / sampleRate;
      const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
      const cw = Math.cos(w);
      const a0 = 1 + alpha;
      this.b = [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0];
      this.a = [(-2 * cw) / a0, (1 - alpha) / a0];
    }
    const [b0, b1, b2] = this.b;
    const [a1, a2] = this.a;
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      const y = b0 * x[i] + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = x[i];
      this.y2 = this.y1;
      this.y1 = y;
      sum += y * y;
    }
    return Math.sqrt(sum / x.length);
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

export class EchoGuard {
  private highpass = new Highpass();
  private hopT: number[] = [];
  /** Mic level per hop, measured like the game's output (bass cut, RMS over the last LEVEL_HOPS hops). */
  private hopRms: number[] = [];
  private recentPow: number[] = [];
  private ratios: number[] = [];
  /** Onsets of recent mic events that weren't echoes (your playing): learning stays clear of them. */
  private playerOnsets: number[] = [];
  private lastLearnAt = -Infinity;
  private learnedUpTo = -Infinity;
  /** Events ignored as the game's own sound. */
  echoes = 0;
  /** Optional trace hook (benches / debugging). */
  debug: ((msg: string) => void) | null = null;
  /** The numbers behind the last check() (debugging / benches). */
  last: { newSound: number; expected: number | null; factor: number } | null = null;

  constructor(private readonly cfg: EchoConfig = ECHO_CONFIG) {}

  reset(): void {
    this.highpass.reset();
    this.hopT = [];
    this.hopRms = [];
    this.recentPow = [];
    this.ratios = [];
    this.playerOnsets = [];
    this.lastLearnAt = -Infinity;
    this.learnedUpTo = -Infinity;
    this.echoes = 0;
    this.last = null;
  }

  /** Each new hop of mic audio (`t` = performance.now() ms the hop ends, as captured). */
  hop(t: number, samples: Float32Array, sampleRate: number): void {
    const rms = this.highpass.rms(samples, sampleRate);
    this.recentPow.push(rms * rms);
    if (this.recentPow.length > LEVEL_HOPS) this.recentPow.shift();
    this.hopT.push(t);
    this.hopRms.push(Math.sqrt(this.recentPow.reduce((a, b) => a + b, 0) / this.recentPow.length));
    if (this.hopT.length > 600) {
      this.hopT.splice(0, 150);
      this.hopRms.splice(0, 150);
    }
    this.learn(t);
  }

  /** How much of the game's sound reaches the mic (RMS ratio, 0 = none), or null while still learning. */
  get coupling(): number | null {
    if (this.ratios.length < this.cfg.minSamples) return null;
    const s = [...this.ratios].sort((a, b) => a - b);
    return s[Math.floor(s.length * this.cfg.couplingPercentile)];
  }

  /**
   * True = ignore this event. Call for every mic detection. Echoes don't stop
   * learning at their moment (they are the leak); if one was really you, the
   * error is bounded: only sounds within matchFactor of the leak get ignored.
   */
  check(d: Detection): boolean {
    const echo = this.isEcho(d);
    if (echo) this.echoes++;
    else {
      this.playerOnsets.push(d.onsetTime);
      if (this.playerOnsets.length > 30) this.playerOnsets.shift();
    }
    return echo;
  }

  /** RMS of what a game sound starting with this mic onset would add at the mic (0 = none), or null while learning. */
  expectedLeak(onset: number): number | null {
    const k = this.coupling;
    if (k === null) return null;
    const c = this.cfg;
    let out = 0;
    // The game's own sounds that start with this onset, measured from their logged start.
    for (const s of outputOnsets(onset - c.alignMs, onset + c.alignMs)) {
      out = Math.max(out, this.outputJump(s.at, c.checkPreFromMs, c.checkPreToMs, c.checkPostFromMs, c.checkPostToMs) ?? 0);
    }
    // A recorded song's notes aren't logged one by one: any jump in its level counts.
    if (outputSounding(onset - c.alignMs, onset + c.checkPostToMs).some((s) => s.pcs === null)) {
      out = Math.max(out, this.outputJump(onset, -c.alignMs - 40, -c.alignMs, -c.alignMs, c.checkPostToMs) ?? 0);
    }
    return k * out;
  }

  /** What the game's output adds around `t` (windows in ms relative to `t`). */
  private outputJump(t: number, preFrom: number, preTo: number, postFrom: number, postTo: number): number | null {
    return jump(outputLevels(t + preFrom, t + preTo), outputLevels(t + postFrom, t + postTo));
  }

  /** Same at the mic (null if those levels aren't there yet). */
  private micJump(t: number, preFrom: number, preTo: number, postFrom: number, postTo: number): number | null {
    const pre: number[] = [];
    const post: number[] = [];
    for (let i = 0; i < this.hopT.length; i++) {
      const dt = this.hopT[i] - t;
      if (dt >= preFrom && dt < preTo) pre.push(this.hopRms[i]);
      else if (dt >= postFrom && dt <= postTo) post.push(this.hopRms[i]);
    }
    return jump(pre, post);
  }

  private isEcho(d: Detection): boolean {
    const c = this.cfg;
    // What this sound added: the mic level since the onset vs just before it.
    const mineNew = this.micJump(d.onsetTime, -60, -5, 0, Infinity) ?? Infinity;
    const expected = this.expectedLeak(d.onsetTime);
    this.last = { newSound: mineNew, expected, factor: 0 };
    if (!expected) return false;
    const sounding = outputSounding(d.onsetTime - c.alignMs, d.onsetTime + c.checkPostToMs);
    const pcs = new Set(sounding.flatMap((s) => s.pcs ?? []));
    const mine = d.type === "chord" && d.chord ? GAME_CHORDS[d.chord].pitchClasses.map((p) => PITCH_CLASSES[p]) : [d.pitchClass];
    const factor = mine.every((p) => pcs.has(p))
      ? c.matchFactor
      : sounding.some((s) => s.pcs === null)
        ? c.unknownFactor
        : c.otherFactor;
    this.last.factor = factor;
    return mineNew <= factor * expected;
  }

  /** At game sounds safely away from your playing, compare the mic's jump with the game's. */
  private learn(now: number) {
    const c = this.cfg;
    if (now - this.lastLearnAt < 100) return;
    this.lastLearnAt = now;
    // Far enough back that any playing near that moment has been detected
    // (an onset up to learnClearAfterMs later, decided up to ~150 ms after it).
    const until = now - c.learnClearAfterMs - 160;
    const from = Math.max(this.learnedUpTo, until - 2000);
    for (const s of outputOnsets(from, until).sort((a, b) => a.at - b.at)) {
      if (s.at <= this.learnedUpTo + 60) continue; // one measurement per moment
      this.learnedUpTo = s.at;
      const at = (s.at / 1000).toFixed(2);
      if (this.playerOnsets.some((p) => p > s.at - c.learnClearBeforeMs && p < s.at + c.learnClearAfterMs)) {
        this.debug?.(`learn ${at}: skip, playing nearby`);
        continue;
      }
      // Only moments where something pitched starts (or a recorded song's beat).
      if (!outputOnsets(s.at - 30, s.at + 30).some((o) => o.pcs === null || o.pcs.length > 0)) {
        this.debug?.(`learn ${at}: skip, drums only`);
        continue;
      }
      const out = this.outputJump(s.at, c.preFromMs, c.preToMs, c.postFromMs, c.postToMs);
      if (out === null || out < c.minOutputRise) {
        this.debug?.(`learn ${at}: skip, game jump too small`);
        continue;
      }
      const mic = this.micJump(s.at, c.preFromMs, c.preToMs, c.postFromMs, c.postToMs);
      if (mic === null) {
        this.debug?.(`learn ${at}: skip, no mic levels`);
        continue;
      }
      this.debug?.(`learn ${at}: game ${out.toFixed(3)} mic ${mic.toFixed(4)} ratio ${(mic / out).toFixed(3)}`);
      this.ratios.push(mic / out);
      if (this.ratios.length > c.maxSamples) this.ratios.shift();
    }
  }
}
