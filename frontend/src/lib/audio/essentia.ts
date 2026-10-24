/**
 * Lazy, client-only singleton for Essentia.js (WASM).
 *
 * Uses the synchronous ES builds (WASM embedded as base64). If the bundled
 * import fails, falls back to the same files on jsDelivr.
 */

/** A std::vector<float> living in WASM memory. Call delete() when done. */
export interface EssentiaVector {
  size(): number;
  delete(): void;
}

export interface PitchYinResult {
  pitch: number;
  pitchConfidence: number;
}

export interface Essentia {
  version: string;
  algorithmNames: string;
  arrayToVector(input: Float32Array): EssentiaVector;
  vectorToArray(input: EssentiaVector): Float32Array;
  // Signatures: https://mtg.github.io/essentia.js/docs/api/Essentia.html
  Windowing(
    frame: EssentiaVector,
    normalized?: boolean,
    size?: number,
    type?: string,
    zeroPadding?: number,
    zeroPhase?: boolean,
  ): { frame: EssentiaVector };
  Spectrum(frame: EssentiaVector, size?: number): { spectrum: EssentiaVector };
  SpectralPeaks(
    spectrum: EssentiaVector,
    magnitudeThreshold?: number,
    maxFrequency?: number,
    maxPeaks?: number,
    minFrequency?: number,
    orderBy?: "frequency" | "magnitude",
    sampleRate?: number,
  ): { frequencies: EssentiaVector; magnitudes: EssentiaVector };
  HPCP(
    frequencies: EssentiaVector,
    magnitudes: EssentiaVector,
    bandPreset?: boolean,
    bandSplitFrequency?: number,
    harmonics?: number,
    maxFrequency?: number,
    maxShifted?: boolean,
    minFrequency?: number,
    nonLinear?: boolean,
    normalized?: string,
    referenceFrequency?: number,
    sampleRate?: number,
    size?: number,
    weightType?: string,
    windowSize?: number,
  ): { hpcp: EssentiaVector };
  PitchYin(
    signal: EssentiaVector,
    frameSize?: number,
    interpolate?: boolean,
    maxFrequency?: number,
    minFrequency?: number,
    sampleRate?: number,
    tolerance?: number,
  ): PitchYinResult;
}

interface EssentiaWasmModule {
  calledRun?: boolean;
  onRuntimeInitialized?: () => void;
}

interface EssentiaModules {
  EssentiaWASM: EssentiaWasmModule;
  Essentia: new (wasm: EssentiaWasmModule, isDebug?: boolean) => Essentia;
}

const ESSENTIA_VERSION = "0.1.3"; // keep in sync with package.json
const CDN_BASE = `https://cdn.jsdelivr.net/npm/essentia.js@${ESSENTIA_VERSION}/dist/`;

let instance: Essentia | null = null;
let loading: Promise<Essentia> | null = null;

/** Tests / Node scripts: use an instance created elsewhere (e.g. the UMD build). */
export function setEssentiaInstance(e: Essentia): void {
  instance = e;
}

/** The loaded instance, or null if loadEssentia() hasn't finished yet. */
export function getLoadedEssentia(): Essentia | null {
  return instance;
}

export function loadEssentia(): Promise<Essentia> {
  if (instance) return Promise.resolve(instance);
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Essentia only runs in the browser."));
  }

  loading ??= (async () => {
    let mods: EssentiaModules;
    try {
      mods = await importBundled();
    } catch (err) {
      console.warn("[essentia] Bundled build failed to load, using CDN.", err);
      mods = await importFromCdn();
    }
    const wasm = await waitForRuntime(mods.EssentiaWASM);
    instance = new mods.Essentia(wasm);
    return instance;
  })().catch((err) => {
    loading = null; // allow a retry
    throw err;
  });

  return loading;
}

async function importBundled(): Promise<EssentiaModules> {
  const [wasm, core] = await Promise.all([
    import("essentia.js/dist/essentia-wasm.es.js"),
    import("essentia.js/dist/essentia.js-core.es.js"),
  ]);
  return { EssentiaWASM: wasm.EssentiaWASM, Essentia: core.default };
}

async function importFromCdn(): Promise<EssentiaModules> {
  const [wasm, core] = await Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${CDN_BASE}essentia-wasm.es.js`),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${CDN_BASE}essentia.js-core.es.js`),
  ]);
  return { EssentiaWASM: wasm.EssentiaWASM, Essentia: core.default };
}

/** The ES build initialises synchronously, but wait just in case. */
function waitForRuntime(wasm: EssentiaWasmModule): Promise<EssentiaWasmModule> {
  if (wasm.calledRun) return Promise.resolve(wasm);
  return new Promise((resolve) => {
    wasm.onRuntimeInitialized = () => resolve(wasm);
  });
}
