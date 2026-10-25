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

const sr = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 48000);
const { samples, items } = buildSelfTest(sr);
// DETECT='{"maxPitchSpreadCents":15}' tries other settings without editing the detector.
const det = new NoteDetector({ ...DETECT_CONFIG, ...JSON.parse(process.env.DETECT ?? "{}") });
// --trace: show the detector's reasoning around every item it got wrong.
const trace = process.argv.includes("--trace");
const traceLines: { t: number; m: string }[] = [];
let traceNow = 0;
if (trace) det.debug = (m) => traceLines.push({ t: traceNow, m });
const events: NoteEvent[] = [];
let id = 1;
const t0 = Date.now();
for (let end = DETECT_CONFIG.frameSize; end <= samples.length; end += DETECT_CONFIG.hopSize) {
  const endTime = (end / sr) * 1000;
  traceNow = endTime;
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
if (trace) {
  for (const it of items) {
    const t = it.offsetSec * 1000;
    const got = events.filter((e) => Math.abs(e.time - t) < 100);
    const ok = got.some((e) => (it.type === "chord" ? e.chord : e.pitchClass) === it.expect);
    if (ok) continue;
    console.log(`\n${it.group} ${it.expect} @${it.offsetSec.toFixed(2)}: got ${got.map((e) => e.chord ?? e.pitchClass).join(",") || "nothing"}`);
    for (const l of traceLines) if (l.t >= t - 30 && l.t <= t + 300) console.log(`   ${(l.t / 1000).toFixed(3)} ${l.m}`);
  }
}
