/**
 * Re-strum bench: a chord rings, then the next strum comes 0.9 s later at a
 * range of strengths (relative to the first). "Same chord" strums the ringing
 * chord again: it must not turn into a neighbouring chord (Em -> G, C -> G).
 * "Change" switches to another chord: it must not stay the old one. Very soft
 * re-strums are meant to be ignored (restrikeGain), so "-" there is fine.
 *   npx tsx scripts/restrum-bench.ts [sampleRate] [--trace]
 * Cells: ok, - (nothing), or what was heard; the number is the level jump (gain).
 * DETECT='{"chordPreWeight":0.4}' tries other settings without editing the detector.
 */
import { createRequire } from "node:module";
import { setEssentiaInstance } from "@/lib/audio/essentia";
import { synthesizeStrum } from "@/lib/audio/testSignals";
import { NoteDetector, DETECT_CONFIG } from "@/lib/input/detector";

const require = createRequire(import.meta.url);
setEssentiaInstance(new (require("essentia.js/dist/essentia.js-core.umd.js"))(require("essentia.js/dist/essentia-wasm.umd.js")));

// Same voicings as the self-test.
const SHAPES: Record<string, number[]> = {
  Em: [40, 47, 52, 55, 59, 64],
  G: [43, 47, 50, 55, 59, 67],
  D: [50, 57, 62, 66],
  C: [48, 52, 55, 60, 64],
  Am: [45, 52, 57, 60, 64],
};
const NAMES = Object.keys(SHAPES);
const STRENGTHS = [0.35, 0.45, 0.55, 0.7, 0.85, 1, 1.3];
const sr = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 48000);
const trace = process.argv.includes("--trace");

type Item = { mode: "same" | "change"; from: string; to: string; strength: number; t: number };
const strums: { name: string; amp: number; t: number }[] = [];
const items: Item[] = [];
let t = 0.3;
for (const mode of ["same", "change"] as const)
  for (const from of NAMES)
    STRENGTHS.forEach((strength, k) => {
      const others = NAMES.filter((n) => n !== from);
      const to = mode === "same" ? from : others[k % others.length];
      strums.push({ name: from, amp: 0.12, t });
      strums.push({ name: to, amp: 0.12 * strength, t: t + 0.9 });
      items.push({ mode, from, to, strength, t: t + 0.9 });
      t += 2.3;
    });

const out = new Float32Array(Math.round((t + 1) * sr));
let r = 12345;
for (let i = 0; i < out.length; i++) {
  r = (r * 1103515245 + 12345) & 0x7fffffff;
  out[i] = ((r / 0x7fffffff) * 2 - 1) * 0.0008;
}
strums.forEach((s, i) => {
  const wave = synthesizeStrum(SHAPES[s.name], sr, { seconds: 1.2, strumMs: 10 + (i % 3) * 5, amp: s.amp, seed: i + 3 });
  const off = Math.round(s.t * sr);
  // Like the self-test: what's ringing drops to 30% over ~25 ms, then rings on underneath.
  for (let j = off; j < out.length; j++) out[j] *= j - off < 1200 ? 1 - ((j - off) / 1200) * 0.7 : 0.3;
  for (let j = 0; j < wave.length && off + j < out.length; j++) out[off + j] += wave[j];
});

const det = new NoteDetector({ ...DETECT_CONFIG, ...JSON.parse(process.env.DETECT ?? "{}") });
const lines: { t: number; m: string }[] = [];
const gains: { t: number; gain: number }[] = [];
let now = 0;
det.debug = (m) => {
  const g = m.match(/gain ([\d.]+) attack/);
  if (g) gains.push({ t: now, gain: Number(g[1]) });
  if (trace) lines.push({ t: now, m });
};
const events: { t: number; what: string }[] = [];
for (let end = DETECT_CONFIG.frameSize; end <= out.length; end += DETECT_CONFIG.hopSize) {
  now = (end / sr) * 1000;
  const { detection } = det.push(out.subarray(end - DETECT_CONFIG.frameSize, end), sr, now);
  if (detection) events.push({ t: detection.onsetTime, what: detection.chord ?? `note ${detection.pitchClass}` });
}

const near = <T extends { t: number }>(a: T[], at: number, after = 250) => a.filter((x) => x.t >= at - 40 && x.t <= at + after);
const tally = { same: { ok: 0, wrong: 0, none: 0 }, change: { ok: 0, wrong: 0, none: 0 } };
const wrong: Item[] = [];
const cell = (it: Item) => {
  const at = it.t * 1000;
  const heard = near(events, at, 150)[0]?.what;
  const gain = near(gains, at)[0]?.gain;
  const res = heard === undefined ? "none" : heard === it.to ? "ok" : "wrong";
  tally[it.mode][res]++;
  if (res === "wrong") wrong.push(it);
  const txt = res === "none" ? "-" : res === "ok" ? "ok" : heard!;
  return `${it.mode === "change" ? `${it.to}:` : ""}${txt}${gain ? ` ${gain.toFixed(1)}` : ""}`.padEnd(13);
};

console.log(`${sr} Hz. Strength of the second strum:  ${STRENGTHS.map((s) => String(s).padEnd(13)).join("")}`);
for (const mode of ["same", "change"] as const) {
  console.log(mode === "same" ? "same chord again" : "change to (cycles through the others)");
  for (const from of NAMES) {
    const row = items.filter((it) => it.mode === mode && it.from === from);
    console.log(`  ${from.padEnd(34)}${row.map(cell).join("")}`);
  }
}
const s = (k: "same" | "change") => `${tally[k].ok} ok, ${tally[k].wrong} wrong, ${tally[k].none} nothing (of ${STRENGTHS.length * NAMES.length})`;
console.log(`\nsame chord: ${s("same")}\nchange:     ${s("change")}`);
if (trace) {
  for (const it of wrong) {
    console.log(`\n${it.from} -> ${it.to} at ${it.strength} (@${it.t.toFixed(2)}):`);
    for (const l of near(lines, it.t * 1000)) console.log(`   ${(l.t / 1000).toFixed(3)} ${l.m}`);
  }
}
