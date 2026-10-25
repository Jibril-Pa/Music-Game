/**
 * Non-guitar rejection bench: the synthetic guitar self-test, with voices,
 * singing, keyboard clicks, fan noise and leaked backing music mixed in
 * between the guitar notes. Reports guitar recall (should stay high) and the
 * fake events each kind of noise causes (should be ~0).
 *   npx tsx scripts/noise-bench.ts
 */
import { createRequire } from "node:module";
import { setEssentiaInstance } from "@/lib/audio/essentia";
import { synthesizeStrum } from "@/lib/audio/testSignals";
import { NoteDetector, DETECT_CONFIG } from "@/lib/input/detector";
import { buildSelfTest, scoreSelfTest } from "@/lib/input/selfTest";
import type { NoteEvent } from "@/lib/input/types";

const require = createRequire(import.meta.url);
setEssentiaInstance(new (require("essentia.js/dist/essentia.js-core.umd.js"))(require("essentia.js/dist/essentia-wasm.umd.js")));

const sr = 48000;
let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Two-pole resonator (formant). */
function resonate(x: Float32Array, f: number, bw: number): Float32Array {
  const r = Math.exp((-Math.PI * bw) / sr);
  const a1 = -2 * r * Math.cos((2 * Math.PI * f) / sr);
  const a2 = r * r;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] - a1 * (y[i - 1] ?? 0) - a2 * (y[i - 2] ?? 0);
  return y;
}

/** A voiced syllable: glottal pulses with a pitch glide, three formants, soft envelope. */
function syllable(seconds: number, f0a: number, f0b: number, attack: number, vibrato = 0, plosive = false): Float32Array {
  const n = Math.round(seconds * sr);
  const src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f0 = (f0a + ((f0b - f0a) * i) / n) * 2 ** ((vibrato * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
    phase += f0 / sr;
    if (phase >= 1) {
      phase -= 1;
      src[i] = 1;
    }
  }
  const formants: [number, number][] = [[600 + rnd() * 300, 90], [1100 + rnd() * 700, 120], [2500, 200]];
  const mix = new Float32Array(n);
  for (const [f, bw] of formants) {
    const y = resonate(src, f, bw);
    for (let i = 0; i < n; i++) mix[i] += y[i] * (f < 1000 ? 1 : 0.5);
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / 0.08);
    mix[i] = (mix[i] / peak) * env * 0.12;
  }
  if (plosive) for (let i = 0; i < Math.round(0.006 * sr); i++) mix[i] += (rnd() * 2 - 1) * 0.15;
  return mix;
}

type Noise = { name: string; make: () => Float32Array };
const NOISES: Noise[] = [
  { name: "speech syllables", make: () => syllable(0.18 + rnd() * 0.2, 110 + rnd() * 80, 110 + rnd() * 120, 0.03 + rnd() * 0.05) },
  { name: "speech (plosive starts)", make: () => syllable(0.2, 120 + rnd() * 60, 150 + rnd() * 80, 0.012, 0, true) },
  { name: "singing (vibrato)", make: () => syllable(0.9, 165, 165, 0.12, 40) },
  {
    name: "keyboard clicks",
    make: () => {
      const s = new Float32Array(Math.round(0.03 * sr));
      for (let i = 0; i < 150; i++) s[i] = (rnd() * 2 - 1) * 0.2 * (1 - i / 150);
      return s;
    },
  },
  {
    name: "leaked backing (quiet strums + bass)",
    make: () => {
      const shapes = [[52, 55, 59, 64], [48, 52, 55, 60], [50, 55, 59, 62], [50, 54, 57, 62]];
      const s = synthesizeStrum(shapes[Math.floor(rnd() * 4)], sr, { seconds: 0.5, strumMs: 15, amp: 0.035, seed: Math.floor(rnd() * 1000) });
      return s;
    },
  },
];

const { samples: guitar, items } = buildSelfTest(sr);
const out = Float32Array.from(guitar);
// Fan: constant hiss under everything.
for (let i = 0; i < out.length; i++) out[i] += (rnd() * 2 - 1) * 0.004;
// Drop noises in the gaps between guitar items (>= 0.35 s from any guitar onset).
const placed: { name: string; at: number; len: number }[] = [];
const onsets = items.map((i) => i.offsetSec);
for (let t = 0.6; t < out.length / sr - 1; t += 0.33) {
  if (onsets.some((o) => Math.abs(o - t) < 0.3 || (t > o && t - o < 0.12))) continue;
  const nz = NOISES[placed.length % NOISES.length];
  const s = nz.make();
  const off = Math.round(t * sr);
  for (let j = 0; j < s.length && off + j < out.length; j++) out[off + j] += s[j];
  placed.push({ name: nz.name, at: t, len: s.length / sr });
}

// DETECT='{"maxPitchSpreadCents":15}' tries other settings without editing the detector.
const det = new NoteDetector({ ...DETECT_CONFIG, ...JSON.parse(process.env.DETECT ?? "{}") });
const trace = process.argv.includes("--trace");
let traceLines: string[] = [];
const why = new Map<number, string[]>();
const allTrace: { t: number; m: string }[] = [];
if (trace) det.debug = (m) => traceLines.push(m);
const events: NoteEvent[] = [];
let id = 1;
for (let end = DETECT_CONFIG.frameSize; end <= out.length; end += DETECT_CONFIG.hopSize) {
  const endTime = (end / sr) * 1000;
  const { detection } = det.push(out.subarray(end - DETECT_CONFIG.frameSize, end), sr, endTime);
  if (trace && detection) {
    const what = detection.chord ?? detection.pitchClass;
    why.set(id, [`${(detection.onsetTime / 1000).toFixed(3)} ${detection.type} ${what} via ${detection.via ?? "onset"}`, ...traceLines.slice(-4).map((l) => `     ${l}`)]);
  }
  if (trace) {
    traceLines = traceLines.slice(-6);
    allTrace.push(...traceLines.slice(-1).map((m) => ({ t: endTime, m })));
  }
  if (detection) events.push({ id: id++, type: detection.type, pitchClass: detection.pitchClass, chord: detection.chord, midi: detection.midi, time: detection.onsetTime, confidence: detection.confidence, source: "mic", latencyMs: endTime - detection.onsetTime });
}
const res = scoreSelfTest(items, 0, events);
let hits = 0;
let total = 0;
for (const g of res.groups) {
  hits += g.hits;
  total += g.total;
  console.log(`guitar: ${g.group.padEnd(30)} ${g.hits}/${g.total}  ${g.wrong.join(", ")}`);
}
const fake = new Map<string, number>();
for (const e of res.extra) {
  const src = placed.find((p) => e.time / 1000 >= p.at - 0.05 && e.time / 1000 <= p.at + p.len);
  const k = src?.name ?? "other";
  fake.set(k, (fake.get(k) ?? 0) + 1);
}
const perKind = new Map<string, number>();
for (const p of placed) perKind.set(p.name, (perKind.get(p.name) ?? 0) + 1);
console.log(`\nguitar recall ${hits}/${total}`);
for (const [k, n] of perKind) console.log(`noise: ${k.padEnd(36)} ${fake.get(k) ?? 0} fake events from ${n} sounds`);
if (fake.get("other")) console.log(`noise: other                                ${fake.get("other")} fake events`);
if (trace) {
  console.log("\nFake events:");
  for (const e of res.extra) {
    const src = placed.find((p) => e.time / 1000 >= p.at - 0.05 && e.time / 1000 <= p.at + p.len);
    console.log(`  [${src?.name ?? "other"}] ${(why.get(e.id) ?? [String(e.id)]).join("\n  ")}`);
  }
  console.log("\nMissed guitar:");
  for (const it of items) {
    const t = it.offsetSec * 1000;
    const got = events.filter((e) => Math.abs(e.time - t) < 100);
    if (got.some((e) => (it.type === "chord" ? e.chord : e.pitchClass) === it.expect)) continue;
    console.log(`  ${it.expect} @${it.offsetSec.toFixed(2)} got ${got.map((e) => e.chord ?? e.pitchClass).join(",") || "nothing"}`);
    const seen = new Set<string>();
    for (const l of allTrace) if (l.t >= t - 30 && l.t <= t + 250 && !seen.has(l.m)) { seen.add(l.m); console.log(`     ${l.m}`); }
  }
}
