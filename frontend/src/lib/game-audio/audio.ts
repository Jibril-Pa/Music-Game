/**
 * Game audio: one AudioContext for music + sound effects, all synthesized
 * (no sample files, so nothing to license). Plucks use the same
 * Karplus-Strong string model as the input self-test.
 *
 * Times: the game thinks in performance.now() ms "as heard". ctxToPerf /
 * perfToCtx map between that and AudioContext time, including output latency,
 * so "on the beat" means on the beat the player hears.
 */

import { synthesizeStrum } from "@/lib/audio/testSignals";

export type SfxName =
  | "jab"
  | "slash"
  | "fireball"
  | "uppercut"
  | "shield"
  | "heal"
  | "super"
  | "hit"
  | "heavyHit"
  | "poof"
  | "hurt"
  | "block"
  | "wind"
  | "parry"
  | "miss"
  | "perfect"
  | "click"
  | "tick"
  | "bite"
  | "smash"
  | "throw"
  | "victory"
  | "defeat";

class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  private noise: AudioBuffer | null = null;
  private plucks = new Map<string, AudioBuffer>();
  musicVolume = 0.7;
  sfxVolume = 0.9;

  /** Create/resume the context. Call from a user gesture the first time. */
  ensure(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = new GainNode(this.ctx, { gain: 0.9 });
      const comp = new DynamicsCompressorNode(this.ctx, { threshold: -14, ratio: 4, attack: 0.003, release: 0.2 });
      this.master.connect(comp).connect(this.ctx.destination);
      this.music = new GainNode(this.ctx, { gain: this.musicVolume });
      this.sfx = new GainNode(this.ctx, { gain: this.sfxVolume });
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.plucks.clear();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.ctx) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** AudioContext time -> performance.now() ms when it is heard. */
  ctxToPerf(t: number): number {
    const ctx = this.ensure();
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime !== undefined) return ts.performanceTime + (t - ts.contextTime) * 1000;
    return performance.now() + (t - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
  }

  /** performance.now() ms (as heard) -> AudioContext time. */
  perfToCtx(p: number): number {
    const ctx = this.ensure();
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime !== undefined) return ts.contextTime + (p - ts.performanceTime) / 1000;
    return ctx.currentTime + (p - performance.now()) / 1000 - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  async close(): Promise<void> {
    const c = this.ctx;
    this.ctx = null;
    if (c && c.state !== "closed") await c.close().catch(() => {});
  }

  // ------------------------------------------------------------ building blocks

  pluckBuffer(midis: number[], strumMs = 0, seconds = 1.6): AudioBuffer {
    const ctx = this.ensure();
    const key = `${midis.join(",")}|${strumMs}|${seconds}`;
    let b = this.plucks.get(key);
    if (!b) {
      const s = synthesizeStrum(midis, ctx.sampleRate, { seconds, strumMs, amp: 0.25, seed: midis[0] });
      b = ctx.createBuffer(1, s.length, ctx.sampleRate);
      b.copyToChannel(s, 0);
      this.plucks.set(key, b);
    }
    return b;
  }

  /** Plucked string(s) at ctx time `at`. */
  pluck(midis: number | number[], { at, gain = 0.6, strumMs = 12, dest, seconds }: { at?: number; gain?: number; strumMs?: number; dest?: AudioNode; seconds?: number } = {}) {
    const ctx = this.ensure();
    const list = Array.isArray(midis) ? midis : [midis];
    const src = new AudioBufferSourceNode(ctx, { buffer: this.pluckBuffer(list, list.length > 1 ? strumMs : 0, seconds) });
    const g = new GainNode(ctx, { gain });
    src.connect(g).connect(dest ?? this.sfx);
    src.start(at ?? ctx.currentTime);
  }

  private noiseBurst(opts: { at?: number; dur: number; gain: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number; dest?: AudioNode }) {
    const ctx = this.ensure();
    const t = opts.at ?? ctx.currentTime;
    const src = new AudioBufferSourceNode(ctx, { buffer: this.noise, loop: true });
    const f = new BiquadFilterNode(ctx, { type: opts.type ?? "bandpass", frequency: opts.f0, Q: opts.q ?? 1 });
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + opts.dur + 0.05);
  }

  private tone(opts: { at?: number; dur: number; gain: number; type?: OscillatorType; f0: number; f1?: number; attack?: number; dest?: AudioNode }) {
    const ctx = this.ensure();
    const t = opts.at ?? ctx.currentTime;
    const o = new OscillatorNode(ctx, { type: opts.type ?? "sine", frequency: opts.f0 });
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g).connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + opts.dur + 0.05);
  }

  /** Short percussion voices for the music. */
  drum(kind: "kick" | "snare" | "hat" | "openhat", at: number, gain = 1, dest?: AudioNode) {
    if (kind === "kick") {
      this.tone({ at, dur: 0.32, gain: 0.9 * gain, f0: 140, f1: 42, dest });
      this.noiseBurst({ at, dur: 0.03, gain: 0.15 * gain, type: "lowpass", f0: 2000, dest });
    } else if (kind === "snare") {
      this.noiseBurst({ at, dur: 0.18, gain: 0.45 * gain, type: "bandpass", f0: 2200, q: 0.8, dest });
      this.tone({ at, dur: 0.1, gain: 0.25 * gain, f0: 220, f1: 160, dest });
    } else {
      this.noiseBurst({ at, dur: kind === "hat" ? 0.04 : 0.18, gain: 0.12 * gain, type: "highpass", f0: 7000, dest });
    }
  }

  /** Soft bass note (triangle through a low-pass). */
  bass(midi: number, at: number, dur: number, gain = 0.4, dest?: AudioNode) {
    const ctx = this.ensure();
    const o = new OscillatorNode(ctx, { type: "triangle", frequency: 440 * 2 ** ((midi - 69) / 12) });
    const f = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 500 });
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.setTargetAtTime(gain * 0.6, at + 0.05, 0.1);
    g.gain.setTargetAtTime(0, at + dur * 0.9, 0.03);
    o.connect(f).connect(g).connect(dest ?? this.music);
    o.start(at);
    o.stop(at + dur + 0.2);
  }

  // ------------------------------------------------------------ sound effects

  play(name: SfxName, opts: { midi?: number; at?: number } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = opts.at ?? ctx.currentTime;
    switch (name) {
      case "jab":
        this.pluck(opts.midi ?? 52, { at: t, gain: 0.55 });
        this.noiseBurst({ at: t, dur: 0.08, gain: 0.12, f0: 3000, f1: 6000 });
        break;
      case "slash":
        this.noiseBurst({ at: t, dur: 0.28, gain: 0.35, f0: 900, f1: 4500, q: 1.2, attack: 0.03 });
        this.pluck([52, 57], { at: t, gain: 0.5 });
        break;
      case "fireball":
        this.noiseBurst({ at: t, dur: 0.6, gain: 0.45, type: "lowpass", f0: 1800, f1: 300, attack: 0.04 });
        this.tone({ at: t, dur: 0.5, gain: 0.3, type: "sawtooth", f0: 220, f1: 70 });
        this.pluck([52, 55, 57], { at: t, gain: 0.45, strumMs: 40 });
        break;
      case "uppercut":
        this.tone({ at: t, dur: 0.4, gain: 0.35, type: "triangle", f0: 160, f1: 1100 });
        this.noiseBurst({ at: t, dur: 0.3, gain: 0.25, f0: 600, f1: 5000 });
        break;
      case "shield":
        [76, 83, 88].forEach((m, i) => this.tone({ at: t + i * 0.03, dur: 1.3, gain: 0.12, f0: 440 * 2 ** ((m - 69) / 12), attack: 0.05 }));
        this.noiseBurst({ at: t, dur: 0.6, gain: 0.08, type: "highpass", f0: 6000, attack: 0.1 });
        break;
      case "heal":
        [67, 72, 74, 79, 84].forEach((m, i) => this.tone({ at: t + i * 0.09, dur: 0.9, gain: 0.14, f0: 440 * 2 ** ((m - 69) / 12) }));
        break;
      case "super":
        this.tone({ at: t, dur: 2.2, gain: 0.5, f0: 82, f1: 41 });
        this.pluck([40, 47, 52, 55, 59, 64], { at: t, gain: 0.9, strumMs: 30, seconds: 2.5 });
        [76, 79, 81, 83, 86, 88].forEach((m, i) => this.tone({ at: t + 0.3 + i * 0.08, dur: 1.2, gain: 0.12, f0: 440 * 2 ** ((m - 69) / 12) }));
        break;
      case "hit":
        this.tone({ at: t, dur: 0.12, gain: 0.45, f0: 180, f1: 60 });
        this.noiseBurst({ at: t, dur: 0.05, gain: 0.25, type: "lowpass", f0: 3000 });
        break;
      case "heavyHit":
        this.tone({ at: t, dur: 0.25, gain: 0.7, f0: 130, f1: 40 });
        this.noiseBurst({ at: t, dur: 0.12, gain: 0.4, type: "lowpass", f0: 2500 });
        break;
      case "poof":
        this.noiseBurst({ at: t, dur: 0.45, gain: 0.3, f0: 2500, f1: 300, q: 0.7 });
        break;
      case "hurt":
        this.tone({ at: t, dur: 0.22, gain: 0.25, type: "square", f0: 260, f1: 110 });
        break;
      case "block":
        this.tone({ at: t, dur: 0.3, gain: 0.25, f0: 1760 });
        this.tone({ at: t, dur: 0.3, gain: 0.15, f0: 2637 });
        break;
      case "wind":
        this.noiseBurst({ at: t, dur: 1.4, gain: 0.5, f0: 300, f1: 1200, q: 0.6, attack: 0.5 });
        break;
      case "parry":
        this.tone({ at: t, dur: 0.5, gain: 0.25, f0: 1318.5 });
        this.tone({ at: t, dur: 0.5, gain: 0.18, f0: 1975.5 });
        this.noiseBurst({ at: t, dur: 0.06, gain: 0.2, type: "highpass", f0: 5000 });
        break;
      case "miss":
        this.tone({ at: t, dur: 0.18, gain: 0.25, f0: 110, f1: 70 });
        break;
      case "perfect":
        this.tone({ at: t, dur: 0.25, gain: 0.08, f0: 2093 });
        break;
      case "click":
        this.tone({ at: t, dur: 0.05, gain: 0.15, f0: 1200 });
        break;
      case "tick":
        this.tone({ at: t, dur: 0.08, gain: 0.25, f0: 1568 });
        break;
      case "bite":
        this.noiseBurst({ at: t, dur: 0.12, gain: 0.35, f0: 1200, q: 2 });
        this.tone({ at: t, dur: 0.1, gain: 0.25, type: "square", f0: 300, f1: 120 });
        break;
      case "smash":
        this.tone({ at: t, dur: 0.4, gain: 0.7, f0: 90, f1: 35 });
        this.noiseBurst({ at: t, dur: 0.35, gain: 0.45, type: "lowpass", f0: 1200 });
        break;
      case "throw":
        this.noiseBurst({ at: t, dur: 0.2, gain: 0.15, f0: 1500, f1: 3000 });
        break;
      case "victory":
        [64, 67, 71, 76, 79, 83, 88].forEach((m, i) => this.pluck(m, { at: t + i * 0.12, gain: 0.6 }));
        this.pluck([40, 47, 52, 55, 59, 64], { at: t + 0.9, gain: 0.8, seconds: 2.5 });
        break;
      case "defeat":
        [64, 62, 59, 55, 52].forEach((m, i) => this.pluck(m, { at: t + i * 0.22, gain: 0.5 }));
        break;
    }
  }
}

export const gameAudio = new GameAudio();
