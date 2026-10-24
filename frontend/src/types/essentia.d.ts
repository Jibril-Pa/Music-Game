// Minimal typings for the Essentia.js ES builds we import directly.
// The full API surface is typed in lib/audio/essentia.ts as we use it.

declare module "essentia.js/dist/essentia-wasm.es.js" {
  export const EssentiaWASM: { calledRun?: boolean; onRuntimeInitialized?: () => void };
}

declare module "essentia.js/dist/essentia.js-core.es.js" {
  const Essentia: new (
    wasm: unknown,
    isDebug?: boolean,
  ) => import("@/lib/audio/essentia").Essentia;
  export default Essentia;
}
