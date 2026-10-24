import { getLoadedEssentia, type Essentia } from "./essentia";

/** Tunable detection constants. */
export const PITCH_CONFIG = {
  /** Frames with RMS below this are treated as silence (0.006 ≈ -44 dBFS). */
  minRms: 0.006,
  /** PitchYin results below this confidence are ignored. */
  minConfidence: 0.85,
  minFrequency: 60,
  maxFrequency: 1000,
  /** PitchYin peak-picking tolerance (Essentia's default). */
  yinTolerance: 0.15,
  /** Median over this many valid readings. */
  smoothingWindow: 5,
  /** Don't report a pitch until this many valid readings agree (hides attack glitches). */
  minReadings: 3,
  /** A frame this many times louder than the last one is a new pluck: smoothing restarts. */
  onsetRatio: 2,
  /** This many frames in a row without a reading also restart smoothing (~350 ms at 48 kHz). */
  silenceResetFrames: 8,
  /** A jump to within ± this many cents of 2×, 3× or ½× the current note is a YIN harmonic error. */
  harmonicToleranceCents: 50,
  /**
   * PitchYin is O(N²), so frames are downsampled to about this rate first.
   * 48 kHz → 24 kHz cuts the cost 4× and keeps errors under 0.5 cents below 500 Hz.
   */
  analysisRate: 22050,
  /** Within ± this many cents counts as in tune. */
  inTuneCents: 5,
} as const;

export interface PitchReading {
  hz: number;
  confidence: number;
}

export interface DetectPitchOptions {
  minRms?: number;
  minConfidence?: number;
  minFrequency?: number;
  maxFrequency?: number;
  tolerance?: number;
  /** Defaults to the singleton from loadEssentia(). */
  essentia?: Essentia;
}

export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/**
 * Runs Essentia PitchYin on one frame. Returns null for silent frames,
 * low-confidence results and out-of-range pitches.
 * Requires loadEssentia() to have resolved (or pass options.essentia).
 */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  options: DetectPitchOptions = {},
): PitchReading | null {
  const {
    minRms = PITCH_CONFIG.minRms,
    minConfidence = PITCH_CONFIG.minConfidence,
    minFrequency = PITCH_CONFIG.minFrequency,
    maxFrequency = PITCH_CONFIG.maxFrequency,
    tolerance = PITCH_CONFIG.yinTolerance,
  } = options;

  const essentia = options.essentia ?? getLoadedEssentia();
  if (!essentia) throw new Error("Essentia isn't loaded yet. Await loadEssentia() first.");

  if (rms(frame) < minRms) return null;

  const factor = Math.max(1, Math.floor(sampleRate / PITCH_CONFIG.analysisRate));
  const signal = decimate(frame, factor);
  const rate = sampleRate / factor;

  const vector = essentia.arrayToVector(signal);
  let pitch: number;
  let pitchConfidence: number;
  try {
    ({ pitch, pitchConfidence } = essentia.PitchYin(
      vector,
      signal.length,
      true, // interpolate
      // Search a little past the requested range: results right at the edge
      // of YIN's search window get clamped and are wrong.
      maxFrequency * 1.06,
      minFrequency / 1.06,
      rate,
      tolerance,
    ));
  } finally {
    vector.delete(); // free WASM memory
  }

  // Essentia's PitchYin reads low by a factor of exactly (1 + 2/N) for an
  // N-sample frame (-0.84 cents at 4096, -1.69 at 2048; measured with sine tones).
  const hz = pitch * (1 + 2 / signal.length);

  if (!Number.isFinite(hz) || hz < minFrequency || hz > maxFrequency) return null;
  if (pitchConfidence < minConfidence) return null;
  return { hz, confidence: pitchConfidence };
}

let decimateBuffer = new Float32Array(0);

/** Box-filter downsample by an integer factor. Reuses one buffer to avoid garbage. */
function decimate(frame: Float32Array, factor: number): Float32Array {
  if (factor === 1) return frame;
  const length = Math.floor(frame.length / factor);
  if (decimateBuffer.length !== length) decimateBuffer = new Float32Array(length);
  for (let i = 0, j = 0; i < length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += frame[j++];
    decimateBuffer[i] = sum / factor;
  }
  return decimateBuffer;
}

// ---------------------------------------------------------------------------
// Note math

export const A4_HZ = 440;
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export interface Note {
  midi: number;
  /** "A", "C#" */
  name: string;
  octave: number;
  /** "A2" */
  label: string;
  /** Exact equal-temperament frequency of this note. */
  hz: number;
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / A4_HZ);
}

export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

/** Positive = sharp, negative = flat. */
export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export function midiToNote(midi: number): Note {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { midi, name, octave, label: `${name}${octave}`, hz: midiToHz(midi) };
}

/** Nearest equal-temperament note and how far off it the input is. */
export function nearestNote(hz: number): Note & { cents: number } {
  const note = midiToNote(Math.round(hzToMidi(hz)));
  return { ...note, cents: centsBetween(hz, note.hz) };
}

// ---------------------------------------------------------------------------
// Guitar strings

export interface GuitarString {
  /** Unique, e.g. "E2" and "E4". */
  id: string;
  name: string;
  octave: number;
  hz: number;
}

export const STANDARD_TUNING: readonly GuitarString[] = [
  { id: "E2", name: "E", octave: 2, hz: 82.41 },
  { id: "A2", name: "A", octave: 2, hz: 110.0 },
  { id: "D3", name: "D", octave: 3, hz: 146.83 },
  { id: "G3", name: "G", octave: 3, hz: 196.0 },
  { id: "B3", name: "B", octave: 3, hz: 246.94 },
  { id: "E4", name: "E", octave: 4, hz: 329.63 },
];

/** The string whose target is closest in pitch (measured in cents). */
export function nearestString(
  hz: number,
  strings: readonly GuitarString[] = STANDARD_TUNING,
): GuitarString {
  let best = strings[0];
  let bestDistance = Infinity;
  for (const s of strings) {
    const distance = Math.abs(centsBetween(hz, s.hz));
    if (distance < bestDistance) {
      best = s;
      bestDistance = distance;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Smoothing

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median over the last `size` readings. Returns null until `minReadings`
 * have arrived, so one-frame glitches at the attack never show.
 */
export class PitchSmoother {
  private values: number[] = [];

  constructor(
    readonly size: number = PITCH_CONFIG.smoothingWindow,
    readonly minReadings: number = PITCH_CONFIG.minReadings,
  ) {}

  /** The smoothed value, or null if there aren't enough readings yet. */
  get current(): number | null {
    return this.values.length >= this.minReadings ? median(this.values) : null;
  }

  push(value: number): number | null {
    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();
    return this.current;
  }

  reset(): void {
    this.values = [];
  }
}

const HARMONIC_RATIOS = [2, 3, 0.5];

/** True if hz is about 2×, 3× or ½× refHz: YIN locked onto a harmonic. */
export function isHarmonicJump(
  hz: number,
  refHz: number,
  toleranceCents: number = PITCH_CONFIG.harmonicToleranceCents,
): boolean {
  const cents = centsBetween(hz, refHz);
  return HARMONIC_RATIOS.some((r) => Math.abs(cents - 1200 * Math.log2(r)) <= toleranceCents);
}

export interface TrackerUpdate {
  /** RMS level of the frame (0..1). */
  rms: number;
  /** Smoothed pitch, or null when there's no reliable pitch right now. */
  hz: number | null;
}

/**
 * Frame-by-frame single-note tracker: detectPitch + median smoothing, plus
 * guards against YIN's harmonic errors while a string rings.
 *
 * - A sudden jump in level is a new pluck, so smoothing restarts. A new string
 *   is never mistaken for a harmonic of the one still ringing.
 * - Within one pluck the pitch can't jump by 2×, 3× or ½×. When YIN reports
 *   that, PitchYin runs again in a narrow window around the current note.
 */
export class PitchTracker {
  private readonly smoother = new PitchSmoother();
  private prevRms = 0;
  private misses = 0;

  constructor(private readonly options: DetectPitchOptions = {}) {}

  push(frame: Float32Array, sampleRate: number): TrackerUpdate {
    const level = rms(frame);
    const minRms = this.options.minRms ?? PITCH_CONFIG.minRms;
    if (level > minRms && level > this.prevRms * PITCH_CONFIG.onsetRatio) this.smoother.reset();
    this.prevRms = level;

    let reading = detectPitch(frame, sampleRate, this.options);
    const ref = this.smoother.current;
    if (reading && ref !== null && isHarmonicJump(reading.hz, ref)) {
      reading = detectPitch(frame, sampleRate, {
        ...this.options,
        minFrequency: ref / 1.25,
        maxFrequency: ref * 1.25,
      });
    }

    if (!reading) {
      if (++this.misses >= PITCH_CONFIG.silenceResetFrames) this.smoother.reset();
      return { rms: level, hz: null };
    }
    this.misses = 0;
    return { rms: level, hz: this.smoother.push(reading.hz) };
  }

  reset(): void {
    this.smoother.reset();
    this.prevRms = 0;
    this.misses = 0;
  }
}
