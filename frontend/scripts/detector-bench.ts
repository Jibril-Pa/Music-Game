/**
 * Offline bench: runs the mic detector over the synthetic self-test signal
 * (same code path as /input-test, minus real-time playback).
 *   npx tsx scripts/detector-bench.ts [sampleRate]
 */
import { createRequire } from "node:module";
import { setEssentiaInstance } from "@/lib/audio/essentia";
import { NoteDetector, DETECT_CONFIG } from "@/lib/input/detector";
import { buildSelfTest, scoreSelfTest } from "@/lib/input/selfTest";
import type { NoteEvent } from "@/lib/input/types";

const require = createRequire(import.meta.url);
// In Node the UMD build exports the (already initialised) WASM module itself.
const wasm = require("essentia.js/dist/essentia-wasm.umd.js");
const Essentia = require("essentia.js/dist/essentia.js-core.umd.js");
setEssentiaInstance(new Essentia(wasm));

const sr = Number(process.argv[2] ?? 48000);
const { samples, items } = buildSelfTest(sr);
const det = new NoteDetector();
const events: NoteEvent[] = [];
let id = 1;
const t0 = Date.now();
for (let end = DETECT_CONFIG.frameSize; end <= samples.length; end += DETECT_CONFIG.hopSize) {
  const endTime = (end / sr) * 1000;
  const { detection } = det.push(samples.subarray(end - DETECT_CONFIG.frameSize, end), sr, endTime);
  if (detection) {
    events.push({ id: id++, type: detection.type, pitchClass: detection.pitchClass, chord: detection.chord, midi: detection.midi,
      time: detection.onsetTime, confidence: detection.confidence, source: "mic", latencyMs: endTime - detection.onsetTime });
  }
}
const res = scoreSelfTest(items, 0, events);
for (const g of res.groups) {
  console.log(`${g.group.padEnd(24)} ${g.hits}/${g.total}  latency ${Math.round(g.latencyMedian ?? -1)} ms  onset err ${Math.round(g.onsetErrorMedian ?? -1)} ms  ${g.wrong.join(", ")}`);
}
console.log(`extra events: ${res.extra.map((e) => `${e.chord ?? e.pitchClass}@${(e.time / 1000).toFixed(2)}`).join(" ")}`);
console.log(`(${sr} Hz, ${(samples.length / sr).toFixed(1)} s of audio analysed in ${Date.now() - t0} ms)`);
