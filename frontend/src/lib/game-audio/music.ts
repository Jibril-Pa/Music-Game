/**
 * Music players. Both expose the song clock (song time <-> performance.now()
 * as heard) and the beat grid, for the rhythm bonus and the boss chart.
 *
 * - ProceduralMusic: a looping E-minor groove synthesized live (Level 1,
 *   and the built-in boss demo song).
 * - BufferSong: a decoded backing.mp3 from the song pipeline.
 */

import type { BeatClock } from "@/lib/combat/rhythm";
import { gameAudio } from "./audio";

export interface SongClock extends BeatClock {
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
        this.onBeat?.(global);
      }
      this.beatTimer = window.setTimeout(tick, 15);
    };
    tick();
  }

  protected stopTicker() {
    if (this.beatTimer !== null) clearTimeout(this.beatTimer);
    this.beatTimer = null;
  }
}

// ------------------------------------------------------------------ procedural

const CHORDS: { root: number; tones: number[] }[] = [
  { root: 40, tones: [52, 55, 59, 64] }, // Em
  { root: 36, tones: [48, 52, 55, 60] }, // C
  { root: 43, tones: [50, 55, 59, 62] }, // G
  { root: 38, tones: [50, 54, 57, 62] }, // D
];

export interface ProceduralOptions {
  bpm: number;
  bars: number;
  style: "forest" | "boss";
  /** Lead notes (song seconds -> midi) played on top, e.g. the boss attacks. */
  lead?: { t: number; midi: number }[];
}

export class ProceduralMusic extends BaseClock implements SongClock {
  readonly bpm: number;
  readonly duration: number;
  private readonly spb: number;
  private beats: number[];
  private timer: number | null = null;
  private nextBeat = 0; // song beat index to schedule next
  private bus: GainNode | null = null;

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
    const chord = CHORDS[bar % 4];
    const half = this.spb / 2;
    const boss = this.opts.style === "boss";

    // drums
    if (beatInBar === 0 || beatInBar === 2) gameAudio.drum("kick", at, boss ? 1 : 0.85, dest);
    if (boss && beatInBar === 2) gameAudio.drum("kick", at + half, 0.6, dest);
    if (beatInBar === 1 || beatInBar === 3) gameAudio.drum("snare", at, boss ? 0.9 : 0.7, dest);
    gameAudio.drum("hat", at, 0.8, dest);
    gameAudio.drum(boss && beatInBar === 3 ? "openhat" : "hat", at + half, 0.5, dest);

    // bass: root on 8ths
    gameAudio.bass(chord.root, at, half * 0.9, boss ? 0.45 : 0.35, dest);
    gameAudio.bass(beatInBar === 3 ? chord.root + 12 : chord.root, at + half, half * 0.9, boss ? 0.4 : 0.3, dest);

    // strummed chord on 1 and the "and" of 2
    if (beatInBar === 0) gameAudio.pluck(chord.tones, { at, gain: boss ? 0.32 : 0.28, strumMs: 18, dest });
    if (beatInBar === 1) gameAudio.pluck(chord.tones.slice(1), { at: at + half, gain: 0.18, strumMs: 12, dest });

    // lead (boss demo: the notes the wolf attacks with)
    if (this.opts.lead) {
      const t0 = b * this.spb;
      for (const n of this.opts.lead) {
        if (n.t >= t0 - 1e-6 && n.t < t0 + this.spb - 1e-6) {
          gameAudio.pluck(n.midi, { at: at + (n.t - t0), gain: 0.42, dest });
        }
      }
    }
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.stopTicker();
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
