/**
 * Crowded-room bench (a hackathon floor, a classroom): the synthetic guitar
 * self-test with a crowd mixed in the whole time, not just between notes:
 * several people talking at once, other players' guitars across the room
 * (the same five chords, softer and reverberant), music from a PA, clapping.
 * Levels are relative to your own guitar (1 = as loud as your strums).
 * Reports, per scene: your notes heard right, misread, missed, and fake
 * events from the crowd (per minute).
 *   npx tsx scripts/crowd-bench.ts [--trace] [scene]
 * DETECT='{"relativeLevel":0.4}' tries other settings without editing the detector.
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
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const HOP = DETECT_CONFIG.hopSize;

function rmsOf(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Loudest hop (RMS) in the first 150 ms: how loud a strum sounds to the detector. */
function peakHop(x: Float32Array, at = 0): number {
  let m = 0;
  for (let i = at; i + HOP <= Math.min(x.length, at + 0.15 * sr); i += HOP) m = Math.max(m, rmsOf(x, i, i + HOP));
  return m;
}

/** Two-pole resonator (formant). */
function resonate(x: Float32Array, f: number, bw: number): Float32Array {
  const r = Math.exp((-Math.PI * bw) / sr);
  const a1 = -2 * r * Math.cos((2 * Math.PI * f) / sr);
  const a2 = r * r;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] - a1 * (y[i - 1] ?? 0) - a2 * (y[i - 2] ?? 0);
  return y;
}

/** A voiced syllable: glottal pulses with a pitch glide, three formants, an onset (soft, or a plosive burst). */
function syllable(seconds: number, f0a: number, f0b: number, attack: number, plosive: boolean): Float32Array {
  const n = Math.round(seconds * sr);
  const src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f0 = (f0a + ((f0b - f0a) * i) / n) * 2 ** ((15 * Math.sin((2 * Math.PI * 5 * i) / sr)) / 1200);
    phase += f0 / sr;
    if (phase >= 1) {
      phase -= 1;
      src[i] = 1;
    }
  }
  const formants: [number, number][] = [[350 + rnd() * 500, 90], [900 + rnd() * 1300, 120], [2400 + rnd() * 400, 200]];
  const mix = new Float32Array(n);
  for (const [f, bw] of formants) {
    const y = resonate(src, f, bw);
    for (let i = 0; i < n; i++) mix[i] += y[i] * (f < 1000 ? 1 : 0.5);
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const startN = plosive ? Math.round(0.008 * sr) : 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / 0.06);
    mix[i] = (mix[i] / peak) * env;
    if (i < startN) mix[i] += (rnd() * 2 - 1) * 0.8 * (1 - i / startN);
  }
  return mix;
}

/** One talker: syllables with short gaps, phrases with pauses. */
function talker(seconds: number, f0: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  let t = rnd() * 0.8;
  while (t < seconds - 0.5) {
    const words = 3 + Math.floor(rnd() * 8);
    for (let w = 0; w < words && t < seconds - 0.5; w++) {
      const len = 0.08 + rnd() * 0.22;
      const glide = (rnd() * 2 - 1) * 0.25;
      const s = syllable(len, f0 * (1 + (rnd() * 2 - 1) * 0.1), f0 * (1 + glide), 0.008 + rnd() * 0.05, rnd() < 0.35);
      const off = Math.round(t * sr);
      const amp = 0.5 + rnd() * 0.5;
      for (let j = 0; j < s.length && off + j < out.length; j++) out[off + j] += s[j] * amp;
      t += len + 0.02 + rnd() * 0.12;
    }
    t += 0.3 + rnd() * 1.2;
  }
  return out;
}

/** A small room reverb (Schroeder: 4 combs + 2 allpasses): sounds from across the room. */
function reverb(x: Float32Array, wet = 0.7): Float32Array {
  const y = new Float32Array(x.length);
  for (const [d, g] of [[1557, 0.84], [1617, 0.83], [1491, 0.82], [1422, 0.81]] as const) {
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < x.length; i++) {
      const out = buf[k];
      buf[k] = x[i] + out * g;
      k = (k + 1) % d;
      y[i] += out * 0.25;
    }
  }
  let z = y;
  for (const [d, g] of [[225, 0.5], [556, 0.5]] as const) {
    const buf = new Float32Array(d);
    const o = new Float32Array(z.length);
    let k = 0;
    for (let i = 0; i < z.length; i++) {
      const b = buf[k];
      o[i] = -z[i] + b;
      buf[k] = z[i] + b * g;
      k = (k + 1) % d;
    }
    z = o;
  }
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (1 - wet) * x[i] + wet * z[i] * 2;
  return out;
}

const SHAPES = [[40, 47, 52, 55, 59, 64], [43, 47, 50, 55, 59, 67], [50, 57, 62, 66], [48, 52, 55, 60, 64], [45, 52, 57, 60, 64]];
const NOTES = [40, 43, 45, 47, 50, 52, 55, 57, 59, 64];

/** Other players' guitars across the room, each strum `level` x your strum. */
function otherGuitars(seconds: number, level: number, ref: number): { track: Float32Array; times: number[] } {
  const dry = new Float32Array(Math.round(seconds * sr));
  const times: number[] = [];
  let t = 0.2 + rnd() * 0.4;
  while (t < seconds - 1) {
    const chord = rnd() < 0.7;
    const s = synthesizeStrum(chord ? SHAPES[Math.floor(rnd() * 5)] : [NOTES[Math.floor(rnd() * NOTES.length)]], sr, { seconds: 1.2, strumMs: chord ? 12 : 0, amp: 0.1, seed: Math.floor(rnd() * 1e5) });
    const k = ((0.6 + rnd() * 0.8) * level * ref) / peakHop(s);
    const off = Math.round(t * sr);
    for (let j = 0; j < s.length && off + j < dry.length; j++) dry[off + j] += s[j] * k;
    times.push(t);
    t += 0.5 + rnd() * 1.1;
  }
  return { track: reverb(dry, 0.6), times };
}

/** PA music: strummed chords on the beat, a bass line, kick and hi-hat. */
function music(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  const beat = 60 / 112;
  for (let b = 0, t = 0; t < seconds - 0.5; b++, t = b * beat) {
    const off = Math.round(t * sr);
    if (b % 2 === 0) {
      const s = synthesizeStrum(SHAPES[Math.floor(b / 8) % 5], sr, { seconds: 1, strumMs: 10, amp: 0.05, seed: b });
      for (let j = 0; j < s.length && off + j < out.length; j++) out[off + j] += s[j];
    }
    const bass = synthesizeStrum([SHAPES[Math.floor(b / 8) % 5][0] - 12], sr, { seconds: 0.5, strumMs: 0, amp: 0.12, seed: b + 999 });
    for (let j = 0; j < bass.length && off + j < out.length; j++) out[off + j] += bass[j];
    for (let j = 0; j < 0.12 * sr && off + j < out.length; j++) {
      const tt = j / sr;
      out[off + j] += (b % 2 === 0 ? 0.5 * Math.sin(2 * Math.PI * (60 + 80 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 25) : 0) + (rnd() * 2 - 1) * 0.08 * Math.exp(-tt * 60);
    }
  }
  return out;
}

/** Applause and single claps. */
function claps(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  let t = 1 + rnd() * 3;
  while (t < seconds - 2) {
    const n = rnd() < 0.5 ? 1 + Math.floor(rnd() * 3) : 20 + Math.floor(rnd() * 30);
    for (let c = 0; c < n; c++) {
      const off = Math.round((t + (n > 3 ? rnd() * 2 : c * 0.25)) * sr);
      const lp = resonate(Float32Array.from({ length: Math.round(0.03 * sr) }, () => rnd() * 2 - 1), 1200 + rnd() * 1000, 900);
      for (let j = 0; j < lp.length; j++) lp[j] *= Math.exp((-j / sr) * 120);
      // Each clap peaks at 1 (x the level): about as loud as a strum at level 1.
      const k = (0.6 + rnd() * 0.8) / peakHop(lp);
      for (let j = 0; j < lp.length && off + j < out.length; j++) out[off + j] += lp[j] * k;
    }
    t += 3 + rnd() * 6;
  }
  return out;
}

// The crowd is there before you play (the title screen, the tuner): 4 s of it first.
const LEAD = 4;
const selfTest = buildSelfTest(sr);
const guitar = new Float32Array(selfTest.samples.length + LEAD * sr);
guitar.set(selfTest.samples, LEAD * sr);
const items = selfTest.items.map((it) => ({ ...it, offsetSec: it.offsetSec + LEAD }));
const seconds = guitar.length / sr;
const ref = (() => {
  const p = items.map((it) => peakHop(guitar, Math.round(it.offsetSec * sr))).sort((a, b) => a - b);
  return p[p.length >> 1];
})();

function scaled(x: Float32Array, rmsTarget: number): Float32Array {
  const k = rmsTarget / (rmsOf(x) || 1);
  return x.map((v) => v * k);
}

seed = 7;
const babbleRaw = (() => {
  const out = new Float32Array(guitar.length);
  for (const f0 of [105, 125, 190, 220, 140, 240]) {
    const t = talker(seconds, f0);
    for (let i = 0; i < out.length; i++) out[i] += t[i];
  }
  return reverb(out, 0.3);
})();
const musicRaw = music(seconds);
const clapRaw = claps(seconds);

type Scene = { name: string; babble?: number; guitars?: number; music?: number; claps?: number };
const SCENES: Scene[] = [
  { name: "quiet room" },
  { name: "talking, normal", babble: 0.1 },
  { name: "talking, loud", babble: 0.2 },
  { name: "talking, very loud", babble: 0.35 },
  { name: "other guitars, far", guitars: 0.25 },
  { name: "other guitars, near", guitars: 0.45 },
  { name: "PA music", music: 0.15 },
  { name: "clapping", claps: 0.5 },
  { name: "hackathon floor", babble: 0.2, guitars: 0.3, music: 0.1, claps: 0.4 },
  { name: "hackathon, loud", babble: 0.3, guitars: 0.4, music: 0.15, claps: 0.5 },
  // The same rooms with the mic 3x closer to your guitar (~10 dB): a laptop right by the soundhole, a clip-on mic.
  { name: "hackathon, mic close", babble: 0.2 / 3, guitars: 0.3 / 3, music: 0.1 / 3, claps: 0.4 / 3 },
  { name: "hack. loud, mic close", babble: 0.3 / 3, guitars: 0.4 / 3, music: 0.15 / 3, claps: 0.5 / 3 },
];

const overrides = { ...DETECT_CONFIG, ...JSON.parse(process.env.DETECT ?? "{}") };
const trace = process.argv.includes("--trace");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));

console.log(`your strum = ${ref.toFixed(3)} RMS; crowd levels below are fractions of that\n`);
console.log(`${"scene".padEnd(22)} heard right (chords, notes)  misread  missed   crowd fakes/min (notes, chords)  floor`);
let totals = { right: 0, wrong: 0, missed: 0, fakes: 0, mins: 0 };
for (const sc of SCENES) {
  if (only && !sc.name.includes(only)) continue;
  const out = Float32Array.from(guitar);
  // Continuous noise: RMS while it sounds, as a fraction of a strum's peak.
  if (sc.babble) {
    const b = scaled(babbleRaw, sc.babble * ref);
    for (let i = 0; i < out.length; i++) out[i] += b[i];
  }
  if (sc.music) {
    const m = scaled(musicRaw, sc.music * ref);
    for (let i = 0; i < out.length; i++) out[i] += m[i];
  }
  if (sc.claps) {
    const c = clapRaw.map((v) => v * sc.claps! * ref);
    for (let i = 0; i < out.length; i++) out[i] += c[i];
  }
  if (sc.guitars) {
    seed = 31;
    const g = otherGuitars(seconds, sc.guitars, ref).track;
    for (let i = 0; i < out.length; i++) out[i] += g[i];
  }
  const det = new NoteDetector(overrides);
  const lines: string[] = [];
  const all: { t: number; m: string }[] = [];
  let nowMs = 0;
  if (trace)
    det.debug = (m) => {
      lines.push(m);
      all.push({ t: nowMs, m });
    };
  const events: (NoteEvent & { why?: string })[] = [];
  let id = 1;
  const floors: number[] = [];
  for (let end = DETECT_CONFIG.frameSize; end <= out.length; end += HOP) {
    const endTime = (end / sr) * 1000;
    nowMs = endTime;
    const { detection: d, diag } = det.push(out.subarray(end - DETECT_CONFIG.frameSize, end), sr, endTime);
    if (endTime > (LEAD + 1) * 1000) floors.push(diag.noiseFloor);
    if (d) events.push({ id: id++, type: d.type, pitchClass: d.pitchClass, chord: d.chord, midi: d.midi, time: d.onsetTime, confidence: d.confidence, source: "mic", why: lines.slice(-3).join(" | ") });
    if (lines.length > 50) lines.splice(0, 40);
  }
  const res = scoreSelfTest(items, 0, events);
  let right = 0;
  let wrong = 0;
  let missed = 0;
  let chordHits = 0;
  for (const g of res.groups) {
    right += g.hits;
    if (g.group.includes("chord") || g.group.includes("Chord")) chordHits += g.hits;
    for (const w of g.wrong) {
      if (w.includes("missed")) missed++;
      else wrong++;
    }
  }
  const fakeNotes = res.extra.filter((e) => e.type === "note").length;
  const fakeChords = res.extra.length - fakeNotes;
  const perMin = (n: number) => ((n / seconds) * 60).toFixed(0);
  const floor = floors.sort((a, b) => a - b)[floors.length >> 1] ?? 0;
  console.log(`${sc.name.padEnd(22)} ${String(right).padStart(4)}/50 (${String(chordHits).padStart(2)}/20, ${String(right - chordHits).padStart(2)}/30)      ${String(wrong).padStart(4)}    ${String(missed).padStart(4)}     ${perMin(res.extra.length).padStart(4)}  (${fakeNotes}, ${fakeChords})          ${(floor / ref).toFixed(2)}`);
  totals = { right: totals.right + right, wrong: totals.wrong + wrong, missed: totals.missed + missed, fakes: totals.fakes + res.extra.length, mins: totals.mins + seconds / 60 };
  if (trace) {
    for (const e of res.extra) console.log(`    fake ${(e.time / 1000).toFixed(2)} ${e.chord ?? e.pitchClass} (${e.type})  ${(e as { why?: string }).why}`);
    for (const it of items) {
      const t = it.offsetSec * 1000;
      const got = events.filter((e) => e.time - t >= -40 && e.time - t <= 150);
      if (got.some((e) => (it.type === "chord" ? e.chord : e.pitchClass) === it.expect && e.type === it.type)) continue;
      console.log(`    ${it.expect} @${it.offsetSec.toFixed(2)} got ${got.map((e) => e.chord ?? e.pitchClass).join(",") || "nothing"}`);
      for (const l of all) if (l.t >= t - 150 && l.t <= t + 260) console.log(`       ${(l.t / 1000).toFixed(3)} ${l.m}`);
    }
  }
}
console.log(`\ntotal: ${totals.right} right, ${totals.wrong} misread, ${totals.missed} missed, ${(totals.fakes / totals.mins).toFixed(1)} fakes/min`);
