/**
 * Music players. Both expose the song clock (song time <-> performance.now()
 * as heard) and the beat grid, for the rhythm bonus and the boss chart.
 *
 * - ProceduralMusic: a looping E-minor groove synthesized live, in the style
 *   of each world (forest strums, desert hand drums and oud, future synths),
 *   for the walking levels and the built-in boss songs.
 * - BufferSong: a decoded backing.mp3 from the song pipeline.
 */

import type { BeatClock } from "@/lib/combat/rhythm";
import { dropFutureOutput, logOutput } from "@/lib/audio/outputLog";
import { gameAudio } from "./audio";

export interface SongClock extends BeatClock {
  /**
   * Adaptive backing: move the harmony to what the player just played (a
   * chord name or a note), so their playing blends in. Optional: a recorded
   * song can't follow.
   */
  follow?(symbol: string, perf?: number): void;
  /** Seconds into the song at performance.now() ms `perf` (as heard). */
  songTimeAt(perf: number): number;
  /** performance.now() ms when song time `t` is heard. */
  perfAt(t: number): number;
  /** Loop length in seconds. */
  readonly duration: number;
  readonly playing: boolean;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Called on each heard beat (index from 0). */
  onBeat: ((beat: number) => void) | null;
}

function nearestIndex(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo] - x) <= Math.abs(sorted[hi] - x) ? lo : hi;
}

/** Shared beat-callback ticker: fires onBeat close to when each beat is heard. */
abstract class BaseClock {
  onBeat: ((beat: number) => void) | null = null;
  protected startCtx = 0;
  protected pausedAt: number | null = null;
  protected isPlaying = false;
  private beatTimer: number | null = null;
  private lastBeatFired = -1;

  abstract readonly duration: number;
  abstract readonly bpm: number;
  protected abstract beatTimes(): number[];

  get playing() {
    return this.isPlaying;
  }

  songTimeAt(perf: number): number {
    if (this.pausedAt !== null) return this.pausedAt;
    return gameAudio.perfToCtx(perf) - this.startCtx;
  }

  perfAt(t: number): number {
    return gameAudio.ctxToPerf(this.startCtx + t);
  }

  offsetToNearestBeat(perf: number): number | null {
    if (!this.isPlaying) return null;
    const beats = this.beatTimes();
    if (!beats.length) return null;
    const t = this.songTimeAt(perf) % this.duration;
    const i = nearestIndex(beats, t);
    return (t - beats[i]) * 1000;
  }

  protected startTicker() {
    this.stopTicker();
    const tick = () => {
      if (!this.isPlaying) return;
      const beats = this.beatTimes();
      const t = this.songTimeAt(performance.now());
      const loop = Math.floor(t / this.duration);
      const local = t - loop * this.duration;
      let idx = beats.findIndex((b) => b > local) - 1;
      if (idx < 0) idx = beats.length - 1;
      const global = loop * beats.length + idx;
      if (global !== this.lastBeatFired && local >= 0) {
        this.lastBeatFired = global;
        this.beatHeard(this.perfAt(loop * this.duration + beats[idx]));
        this.onBeat?.(global);
      }
      this.beatTimer = window.setTimeout(tick, 15);
    };
    tick();
  }

  /** A beat was just heard at `perf` (performance.now() ms). */
  protected beatHeard(perf: number) {
    void perf;
  }

  protected stopTicker() {
    if (this.beatTimer !== null) clearTimeout(this.beatTimer);
    this.beatTimer = null;
  }
}

// ------------------------------------------------------------------ procedural

/** Voicings the backing can play: bass root + mid-range chord tones. */
const VOICINGS: Record<string, { root: number; tones: number[] }> = {
  Em: { root: 40, tones: [52, 55, 59, 64] },
  C: { root: 36, tones: [48, 52, 55, 60] },
  G: { root: 43, tones: [50, 55, 59, 62] },
  D: { root: 38, tones: [50, 54, 57, 62] },
  Am: { root: 45, tones: [52, 57, 60, 64] },
  A: { root: 45, tones: [52, 57, 61, 64] },
  E: { root: 40, tones: [52, 56, 59, 64] },
};
/** The default progression: Em - C - G - D, one chord per bar. */
const PROGRESSION = ["Em", "C", "G", "D"];
/** A single note becomes the in-key chord that contains it. */
const NOTE_HARMONY: Record<string, string> = {
  E: "Em", "F#": "D", G: "G", A: "Am", B: "Em", C: "C", D: "D", "D#": "Em", F: "C", "G#": "Am", "A#": "G", "C#": "Am",
};

/** Each world has its own groove (same chords, so the player always fits). */
export type MusicWorld = "forest" | "desert" | "future";

export interface ProceduralOptions {
  bpm: number;
  bars: number;
  world: MusicWorld;
  /** Boss fights hit harder. */
  boss?: boolean;
  /** Lead notes or strums (song seconds -> midi), e.g. the boss attacks. */
  lead?: { t: number; midi: number | number[] }[];
}

interface Groove {
  at: number;
  half: number;
  beatInBar: number;
  chord: { root: number; tones: number[] };
  boss: boolean;
  dest: AudioNode;
}

export class ProceduralMusic extends BaseClock implements SongClock {
  readonly bpm: number;
  readonly duration: number;
  private readonly spb: number;
  private beats: number[];
  private timer: number | null = null;
  private nextBeat = 0; // song beat index to schedule next
  private bus: GainNode | null = null;
  /** Player-driven harmony: active between these song times. */
  private harmony: { name: string; from: number; until: number } | null = null;

  constructor(private readonly opts: ProceduralOptions) {
    super();
    this.bpm = opts.bpm;
    this.spb = 60 / opts.bpm;
    this.duration = opts.bars * 4 * this.spb;
    this.beats = Array.from({ length: opts.bars * 4 }, (_, i) => i * this.spb);
  }

  protected beatTimes() {
    return this.beats;
  }

  start(): void {
    const ctx = gameAudio.ensure();
    this.stop();
    this.bus = new GainNode(ctx, { gain: 1 });
    this.bus.connect(gameAudio.music);
    this.startCtx = ctx.currentTime + 0.12;
    this.nextBeat = 0;
    this.pausedAt = null;
    this.isPlaying = true;
    this.schedule();
    this.startTicker();
  }

  private schedule = () => {
    if (!this.isPlaying) return;
    const ctx = gameAudio.ensure();
    const horizon = ctx.currentTime + 0.25;
    while (this.startCtx + this.nextBeat * this.spb < horizon) {
      this.scheduleBeat(this.nextBeat, this.startCtx + this.nextBeat * this.spb);
      this.nextBeat++;
    }
    this.timer = window.setTimeout(this.schedule, 30);
  };

  private scheduleBeat(globalBeat: number, at: number) {
    const dest = this.bus!;
    const beatsPerLoop = this.opts.bars * 4;
    const b = globalBeat % beatsPerLoop;
    const bar = Math.floor(b / 4);
    const beatInBar = b % 4;
    const t0 = b * this.spb;
    const loopStart = (globalBeat - b) * this.spb;
    const h = this.harmony;
    const songT = loopStart + t0;
    const chord = VOICINGS[h && songT >= h.from - 1e-6 && songT < h.until ? h.name : PROGRESSION[bar % 4]];
    const half = this.spb / 2;
    const boss = !!this.opts.boss;
    const groove = { forest: this.forestBeat, desert: this.desertBeat, future: this.futureBeat }[this.opts.world];
    groove.call(this, { at, half, beatInBar, chord, boss, dest });

    // lead (boss demo: the notes the wolf attacks with)
    if (this.opts.lead) {
      for (const n of this.opts.lead) {
        if (n.t >= t0 - 1e-6 && n.t < t0 + this.spb - 1e-6) {
          gameAudio.pluck(n.midi, { at: at + (n.t - t0), gain: Array.isArray(n.midi) ? 0.3 : 0.42, strumMs: 16, dest });
        }
      }
    }
  }

  /** Storybook folk: kick and snare, bass on 8ths, strums on 1 and the "and" of 2. */
  private forestBeat({ at, half, beatInBar, chord, boss, dest }: Groove) {
    if (beatInBar === 0 || beatInBar === 2) gameAudio.drum("kick", at, boss ? 1 : 0.85, dest);
    if (boss && beatInBar === 2) gameAudio.drum("kick", at + half, 0.6, dest);
    if (beatInBar === 1 || beatInBar === 3) gameAudio.drum("snare", at, boss ? 0.9 : 0.7, dest);
    gameAudio.drum("hat", at, 0.8, dest);
    gameAudio.drum(boss && beatInBar === 3 ? "openhat" : "hat", at + half, 0.5, dest);
    gameAudio.bass(chord.root, at, half * 0.9, boss ? 0.45 : 0.35, dest);
    gameAudio.bass(beatInBar === 3 ? chord.root + 12 : chord.root, at + half, half * 0.9, boss ? 0.4 : 0.3, dest);
    if (beatInBar === 0) gameAudio.pluck(chord.tones, { at, gain: boss ? 0.32 : 0.28, strumMs: 18, dest });
    if (beatInBar === 1) gameAudio.pluck(chord.tones.slice(1), { at: at + half, gain: 0.18, strumMs: 12, dest });
  }

  /** Desert: a darbuka groove (doum-tek), riq jingles, drone bass, an oud picking the chord. */
  private desertBeat({ at, half, beatInBar, chord, boss, dest }: Groove) {
    // maqsum: DOUM tek . tek | DOUM . tek .
    const hits: [("doum" | "tek" | null), ("doum" | "tek" | null)][] = [["doum", "tek"], [null, "tek"], ["doum", null], ["tek", null]];
    const [on, off] = hits[beatInBar];
    if (on) gameAudio.drum(on, at, boss ? 1 : 0.85, dest);
    if (off) gameAudio.drum(off, at + half, 0.7, dest);
    if (boss && beatInBar === 3) gameAudio.drum("doum", at + half, 0.6, dest);
    gameAudio.drum("jingle", at, 0.7, dest);
    gameAudio.drum("jingle", at + half, 0.45, dest);
    if (beatInBar === 0) gameAudio.bass(chord.root, at, this.spb * 1.9, boss ? 0.42 : 0.34, dest);
    if (beatInBar === 2) gameAudio.bass(chord.root + 7, at, this.spb * 1.9, 0.26, dest);
    const order = [0, 2, 1, 3];
    const t = chord.tones;
    gameAudio.pluck(t[order[beatInBar]], { at, gain: boss ? 0.24 : 0.2, seconds: 0.6, dest });
    gameAudio.pluck(t[(order[beatInBar] + 1) % t.length] + (beatInBar === 3 ? 12 : 0), { at: at + half, gain: 0.14, seconds: 0.5, dest });
  }

  /** Year 3000: four-on-the-floor, claps, 16th hats, octave synth bass, arpeggios. */
  private futureBeat({ at, half, beatInBar, chord, boss, dest }: Groove) {
    const q = half / 2;
    gameAudio.drum("kick", at, boss ? 1 : 0.85, dest);
    if (beatInBar === 1 || beatInBar === 3) gameAudio.drum("clap", at, boss ? 0.95 : 0.8, dest);
    for (let i = 0; i < 4; i++) gameAudio.drum("hat", at + i * q, i % 2 ? 0.35 : 0.6, dest);
    gameAudio.bass(chord.root, at, half * 0.8, 0.36, dest);
    gameAudio.bass(chord.root + 12, at + half, half * 0.8, 0.28, dest);
    for (let i = 0; i < 4; i++) {
      gameAudio.synth(chord.tones[(beatInBar * 4 + i) % chord.tones.length] + 12, at + i * q, q * 0.9, boss ? 0.055 : 0.045, "square", dest);
    }
    if (beatInBar === 0) gameAudio.pad(chord.tones, at, this.spb * 3.8, 0.035, dest);
  }

  follow(symbol: string, perf: number = performance.now()): void {
    if (!this.isPlaying || !this.bus) return;
    const name = VOICINGS[symbol] ? symbol : NOTE_HARMONY[symbol];
    if (!name) return;
    const ctx = gameAudio.ensure();
    const t = this.songTimeAt(perf);
    const half = this.spb / 2;
    // Answer on the next half-beat with a soft pad + bass, then keep that
    // harmony for the rest of this bar and the next one.
    let at = Math.ceil(t / half) * half;
    if (this.startCtx + at < ctx.currentTime + 0.02) at += half;
    const barEnd = (Math.floor(at / (this.spb * 4)) + 2) * this.spb * 4;
    this.harmony = { name, from: at, until: barEnd };
    const v = VOICINGS[name];
    gameAudio.pad(v.tones, this.startCtx + at, this.spb * 2, 0.06, this.bus);
    gameAudio.bass(v.root, this.startCtx + at, half * 0.9, 0.35, this.bus);
  }

  stop(): void {
    this.isPlaying = false;
    this.harmony = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.stopTicker();
    // Beats scheduled ahead won't play now: don't let the mic expect them.
    dropFutureOutput();
    if (this.bus) {
      const b = this.bus;
      const ctx = gameAudio.ctx;
      if (ctx) b.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => b.disconnect(), 300);
    }
    this.bus = null;
  }

  pause(): void {
    if (!this.isPlaying) return;
    const t = this.songTimeAt(performance.now());
    this.stop();
    this.pausedAt = t;
  }

  resume(): void {
    if (this.pausedAt === null) return;
    const t = this.pausedAt;
    const ctx = gameAudio.ensure();
    this.bus = new GainNode(ctx, { gain: 1 });
    this.bus.connect(gameAudio.music);
    // Restart on the next whole beat after the paused position.
    const nextBeat = Math.ceil(t / this.spb);
    this.startCtx = ctx.currentTime + 0.1 - t;
    this.nextBeat = nextBeat;
    this.pausedAt = null;
    this.isPlaying = true;
    this.schedule();
    this.startTicker();
  }
}

// ------------------------------------------------------------------ decoded song

export class BufferSong extends BaseClock implements SongClock {
  readonly duration: number;
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;

  constructor(
    private readonly buffer: AudioBuffer,
    private readonly beats: number[],
    readonly bpm: number,
  ) {
    super();
    this.duration = buffer.duration;
  }

  static async load(url: string, beats: number[], bpm: number, signal?: AbortSignal): Promise<BufferSong> {
    const ctx = gameAudio.ensure();
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Couldn't load ${url} (HTTP ${res.status})`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    return new BufferSong(buf, beats, bpm);
  }

  protected beatTimes() {
    return this.beats;
  }

  /** A recorded song's notes are unknown: tell the mic "something is playing" on each beat. */
  protected beatHeard(perf: number) {
    logOutput({ at: perf, until: perf + (60 / this.bpm) * 1000, pcs: null });
  }

  private playFrom(offset: number) {
    const ctx = gameAudio.ensure();
    this.gain = new GainNode(ctx, { gain: 1 });
    this.gain.connect(gameAudio.music);
    const src = new AudioBufferSourceNode(ctx, { buffer: this.buffer, loop: true });
    src.connect(this.gain);
    const at = ctx.currentTime + 0.12;
    src.start(at, offset % this.duration);
    this.startCtx = at - offset;
    this.src = src;
    this.pausedAt = null;
    this.isPlaying = true;
    this.startTicker();
  }

  start(): void {
    this.stop();
    this.playFrom(0);
  }

  stop(): void {
    this.isPlaying = false;
    this.stopTicker();
    try {
      this.src?.stop();
    } catch {
      /* already stopped */
    }
    this.src?.disconnect();
    this.gain?.disconnect();
    this.src = null;
    this.gain = null;
  }

  pause(): void {
    if (!this.isPlaying) return;
    const t = this.songTimeAt(performance.now());
    this.stop();
    this.pausedAt = t;
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.playFrom(this.pausedAt);
  }
}
