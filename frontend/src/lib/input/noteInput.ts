/**
 * The game's note input: mic (Essentia) + an always-on keyboard fallback.
 * Emits NoteEvents: one per pluck / strum / key press, never per frame.
 *
 * Keyboard chords: 1=Em 2=G 3=C 4=D 5=A 6=Am 7=E
 * Keyboard notes:  Z=E  X=G  C=A  V=B  B=D  N=C
 */

import { loadEssentia } from "@/lib/audio/essentia";
import { startPipeline, type AudioPipeline, type AudioSource } from "@/lib/audio/micPipeline";
import { DETECT_CONFIG, NoteDetector, type DetectorDiag } from "./detector";
import { EchoGuard } from "./echoGuard";
import { pitchClassOf, type ChordName, type NoteEvent, type PitchClass } from "./types";

export const KEY_NOTES: Record<string, { pc: PitchClass; midi: number; label: string }> = {
  KeyZ: { pc: "E", midi: 52, label: "Z" },
  KeyX: { pc: "G", midi: 55, label: "X" },
  KeyC: { pc: "A", midi: 57, label: "C" },
  KeyV: { pc: "B", midi: 59, label: "V" },
  KeyB: { pc: "D", midi: 62, label: "B" },
  KeyN: { pc: "C", midi: 60, label: "N" },
};
export const KEY_CHORDS: Record<string, { chord: ChordName; root: PitchClass; label: string }> = {
  Digit1: { chord: "Em", root: "E", label: "1" },
  Digit2: { chord: "G", root: "G", label: "2" },
  Digit3: { chord: "C", root: "C", label: "3" },
  Digit4: { chord: "D", root: "D", label: "4" },
  Digit5: { chord: "A", root: "A", label: "5" },
  Digit6: { chord: "Am", root: "A", label: "6" },
  Digit7: { chord: "E", root: "E", label: "7" },
};
/** Keyboard key for a symbol: keyFor("Em", "chord") -> "1", keyFor("E", "note") -> "Z". */
export function keyFor(input: string, kind: "note" | "chord" = "note"): string | undefined {
  return kind === "chord"
    ? Object.values(KEY_CHORDS).find((k) => k.chord === input)?.label
    : Object.values(KEY_NOTES).find((k) => k.pc === input)?.label;
}

export type NoteListener = (e: NoteEvent) => void;

/** Page-wide, so ids stay unique even if the NoteInput is recreated. */
let nextEventId = 1;
export interface EchoStats {
  /** How much of the game's sound reaches the mic (0 = none), null while learning. */
  coupling: number | null;
  /** Mic events ignored as the game's own sound. */
  echoes: number;
}
export type DiagListener = (d: DetectorDiag & { latency: LatencyStats; echo: EchoStats }) => void;
export type MicStatus = "off" | "starting" | "on" | "error";

export interface LatencyStats {
  last: number | null;
  median: number | null;
  p90: number | null;
  /** Input latency the browser reports for the mic (ms), if any. */
  input: number | null;
  count: number;
}

export class NoteInput {
  private listeners = new Set<NoteListener>();
  private diagListeners = new Set<DiagListener>();
  private statusListeners = new Set<(s: MicStatus, err?: string) => void>();
  private pipeline: AudioPipeline | null = null;
  private detector = new NoteDetector();
  private echo = new EchoGuard();
  private source: AudioSource = { kind: "mic" };
  /** Laptop speakers, no headphones: browser echo cancellation on. */
  speakerMode = false;
  private latencies: number[] = [];
  private inputLatencyMs: number | null = null;
  private lastDiagAt = 0;
  private keyboardAttached = false;
  private session = 0;
  status: MicStatus = "off";
  error: string | undefined;

  on(fn: NoteListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onDiag(fn: DiagListener): () => void {
    this.diagListeners.add(fn);
    return () => this.diagListeners.delete(fn);
  }
  onStatus(fn: (s: MicStatus, err?: string) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: MicStatus, err?: string) {
    this.status = s;
    this.error = err;
    this.statusListeners.forEach((fn) => fn(s, err));
  }

  private emit(e: Omit<NoteEvent, "id">) {
    const ev: NoteEvent = { ...e, id: nextEventId++ };
    if (ev.source === "mic" && ev.latencyMs !== undefined) {
      this.latencies.push(ev.latencyMs);
      if (this.latencies.length > 50) this.latencies.shift();
    }
    this.listeners.forEach((fn) => fn(ev));
  }

  latencyStats(): LatencyStats {
    const s = [...this.latencies].sort((a, b) => a - b);
    const q = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
    return {
      last: this.latencies.at(-1) ?? null,
      median: q(0.5),
      p90: q(0.9),
      input: this.inputLatencyMs,
      count: s.length,
    };
  }

  // ------------------------------------------------------------ keyboard

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const n = KEY_NOTES[e.code];
    const c = KEY_CHORDS[e.code];
    const time = e.timeStamp || performance.now();
    if (n) this.emit({ type: "note", pitchClass: n.pc, midi: n.midi, time, confidence: 1, source: "keyboard" });
    else if (c) this.emit({ type: "chord", pitchClass: c.root, chord: c.chord, time, confidence: 1, source: "keyboard" });
  };

  attachKeyboard(): void {
    if (this.keyboardAttached || typeof window === "undefined") return;
    window.addEventListener("keydown", this.onKeyDown);
    this.keyboardAttached = true;
  }

  detachKeyboard(): void {
    if (!this.keyboardAttached) return;
    window.removeEventListener("keydown", this.onKeyDown);
    this.keyboardAttached = false;
  }

  // ------------------------------------------------------------ mic

  get micOn(): boolean {
    return this.status === "on";
  }

  /** Call from a user gesture. `source` defaults to the mic (buffer = self-test). */
  async startMic(source: AudioSource = { kind: "mic" }): Promise<void> {
    await this.stopMic();
    const session = ++this.session;
    this.source = source;
    if (source.kind === "mic") source = { ...source, echoCancellation: this.speakerMode };
    this.setStatus("starting");
    try {
      await loadEssentia();
      const pipeline = await startPipeline({
        source,
        frameSize: DETECT_CONFIG.frameSize,
        hopSize: DETECT_CONFIG.hopSize,
        onFrame: (frame, sr, endFrame) => this.onFrame(frame, sr, endFrame),
        onEnded: () => {
          if (session === this.session) void this.stopMic("The microphone was disconnected.");
        },
      });
      if (session !== this.session) {
        await pipeline.stop();
        return;
      }
      this.pipeline = pipeline;
      this.detector.reset();
      this.echo.reset();
      this.latencies = [];
      this.inputLatencyMs = pipeline.inputLatencyMs;
      this.setStatus("on");
    } catch (err) {
      if (session === this.session) this.setStatus("error", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /** Releases the mic (tracks stopped, AudioContext closed). Safe to call twice. */
  async stopMic(error?: string): Promise<void> {
    this.session++;
    const p = this.pipeline;
    this.pipeline = null;
    if (p) await p.stop();
    if (error) this.setStatus("error", error);
    else if (this.status !== "off") this.setStatus("off");
  }

  /**
   * Laptop-speaker mode. Restarts a running mic so the browser's echo
   * cancellation takes effect. (The echo guard runs either way.)
   */
  async setSpeakerMode(on: boolean): Promise<void> {
    if (on === this.speakerMode) return;
    this.speakerMode = on;
    if (this.micOn && this.source.kind === "mic") await this.startMic(this.source).catch(() => {});
  }

  /** Mic/test-source context time (s) -> performance.now() ms, or null when off. */
  contextTimeToPerf(t: number): number | null {
    const p = this.pipeline;
    return p ? this.frameToPerf(p.audioContext, t * p.sampleRate, p.sampleRate) : null;
  }

  /**
   * Context sample index -> performance.now() ms of when that sample was
   * captured. getOutputTimestamp() says when a frame reaches the *speakers*,
   * which is one output latency after the same frame left the mic side of
   * the graph, so that latency is taken off.
   */
  private frameToPerf(ctx: AudioContext, sampleIndex: number, sampleRate: number): number {
    const t = sampleIndex / sampleRate;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime !== undefined) {
      const outLatency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
      return ts.performanceTime + (t - ts.contextTime) * 1000 - outLatency;
    }
    return performance.now() - (ctx.currentTime - t) * 1000;
  }

  private onFrame(frame: Float32Array, sampleRate: number, endFrame: number) {
    const p = this.pipeline;
    if (!p) return;
    const endTime = this.frameToPerf(p.audioContext, endFrame, sampleRate) - (this.inputLatencyMs ?? 0);
    const pushed = this.detector.push(frame, sampleRate, endTime);
    const diag = pushed.diag;
    this.echo.hop(endTime, frame.subarray(frame.length - DETECT_CONFIG.hopSize), sampleRate);
    let detection = pushed.detection;
    if (detection && this.echo.check(detection)) {
      // The game's own sound from the speakers, not the player.
      this.detector.retract();
      detection = null;
    }
    const now = performance.now();
    if (detection) {
      this.emit({
        type: detection.type,
        pitchClass: detection.pitchClass,
        midi: detection.midi,
        chord: detection.chord,
        time: detection.onsetTime,
        confidence: detection.confidence,
        source: "mic",
        latencyMs: Math.max(0, now - detection.onsetTime),
      });
    }
    if (this.diagListeners.size && now - this.lastDiagAt > 40) {
      this.lastDiagAt = now;
      const full = { ...diag, latency: this.latencyStats(), echo: { coupling: this.echo.coupling, echoes: this.echo.echoes } };
      this.diagListeners.forEach((fn) => fn(full));
    }
  }

  /** Stop everything (leaving the page). */
  async dispose(): Promise<void> {
    this.detachKeyboard();
    await this.stopMic();
    this.listeners.clear();
    this.diagListeners.clear();
    this.statusListeners.clear();
  }
}

let shared: NoteInput | null = null;

/** One NoteInput for the page. */
export function getNoteInput(): NoteInput {
  shared ??= new NoteInput();
  return shared;
}

/** Stops the mic and forgets the shared instance (call when leaving the page). */
export async function disposeNoteInput(): Promise<void> {
  const s = shared;
  shared = null;
  await s?.dispose();
}

export { pitchClassOf };
