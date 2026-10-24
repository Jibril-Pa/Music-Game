import { getLoadedEssentia, type Essentia, type EssentiaVector } from "./essentia";
import { rms } from "./pitch";

/** Tunable constants for chroma (pitch-class) extraction. */
export const CHROMA_CONFIG = {
  /** Bigger frames than the tuner: chords need finer low-frequency resolution. */
  frameSize: 8192,
  hopSize: 4096,
  /** Frames with RMS below this are treated as silence. */
  minRms: 0.006,
  minFrequency: 60,
  maxFrequency: 5000,
  maxPeaks: 100,
  /** HPCP: how many harmonics each spectral peak also votes for. */
  harmonics: 8,
} as const;

export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** C4. HPCP bin 0 is the pitch class of its reference frequency, so bin 0 = C. */
const C_REFERENCE_HZ = 261.6256;

export interface ChromaFrame {
  /** 12 values, index 0 = C, loudest = 1. */
  chroma: Float32Array;
  rms: number;
}

export interface ChromaOptions {
  minRms?: number;
  harmonics?: number;
  essentia?: Essentia;
}

/**
 * Pitch-class profile of one frame via Essentia:
 * Windowing → Spectrum → SpectralPeaks → HPCP. Returns null for silent frames.
 */
export function computeChroma(
  frame: Float32Array,
  sampleRate: number,
  options: ChromaOptions = {},
): ChromaFrame | null {
  const essentia = options.essentia ?? getLoadedEssentia();
  if (!essentia) throw new Error("Essentia isn't loaded yet. Await loadEssentia() first.");

  const level = rms(frame);
  if (level < (options.minRms ?? CHROMA_CONFIG.minRms)) return null;

  const c = CHROMA_CONFIG;
  const vectors: EssentiaVector[] = [];
  const keep = <T extends EssentiaVector>(v: T) => (vectors.push(v), v);

  try {
    const input = keep(essentia.arrayToVector(frame));
    const windowed = keep(essentia.Windowing(input, true, frame.length, "blackmanharris62", 0, true).frame);
    const spectrum = keep(essentia.Spectrum(windowed, frame.length).spectrum);
    const peaks = essentia.SpectralPeaks(spectrum, 0, c.maxFrequency, c.maxPeaks, c.minFrequency, "frequency", sampleRate);
    keep(peaks.frequencies);
    keep(peaks.magnitudes);
    if (peaks.frequencies.size() === 0) return null;

    const magnitudes = essentia.vectorToArray(peaks.magnitudes);
    // HPCP squares magnitudes, so the loudest string drowns out the rest.
    // A cube root evens notes out (the third of a chord is often one quiet string).
    const compressed = keep(essentia.arrayToVector(magnitudes.map(Math.cbrt)));

    const hpcp = keep(
      essentia.HPCP(
        peaks.frequencies,
        compressed,
        // The band preset normalises <500 Hz and >500 Hz separately, which
        // blows up noise when one band is nearly empty.
        false, // bandPreset
        500, // bandSplitFrequency (unused without the preset)
        options.harmonics ?? c.harmonics,
        c.maxFrequency,
        false, // maxShifted
        c.minFrequency,
        false, // nonLinear
        "unitMax",
        C_REFERENCE_HZ,
        sampleRate,
        12,
        "squaredCosine",
        1,
      ).hpcp,
    );

    const chroma = essentia.vectorToArray(hpcp);
    if (!chroma.some((v) => v > 0)) return null;

    return { chroma, rms: level };
  } finally {
    for (const v of vectors) v.delete(); // free WASM memory
  }
}
