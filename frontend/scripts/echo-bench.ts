/**
 * Laptop-speaker bench: the guitar self-test with the game's own music
 * leaking into the mic (a synthetic copy of the Level 1 groove: drums, bass,
 * strums, plus the "follow" pad + bass after each chord you play), at several
 * speaker volumes. The music is logged like the game logs it, so the echo
 * guard can use it. Reports guitar recall and fake events, guard off vs on.
 *
 *   npx tsx scripts/echo-bench.ts [options]
 *     --onbeat    strum right on the beat, the same chord the music plays,
 *                 instead of the self-test (the hardest case for not
 *                 ignoring real playing)
 *     --flat      a flat speaker (default: laptop speakers, little below ~200 Hz)
 *     --song      the game only knows the beats, not the notes (recorded boss song)
 *     --skew=25   the game's output-latency estimate is off by 25 ms
 *     --no-intro  you're already playing when the music starts (no time to learn first)
 *     --trace     each event's new sound vs the expected leak, real and fake
 *     --why-ignored   what the game played around each real note it ignored
 *     --learn=0.5     how the guard learns at that speaker level
 *     --why       the detector's reasoning for guitar it got wrong (no music;
 *                 --why=0.3 at that speaker level, guard off)
 *   ECHO='{"matchFactor":1.4}' / DETECT='{...}' try other settings.
 */
import { createRequire } from "node:module";
import { setEssentiaInstance } from "@/lib/audio/essentia";
import { LEVEL_HIGHPASS_HZ, clearOutputLog, logOutput, logOutputLevel, outputLevels, outputOnsets } from "@/lib/audio/outputLog";
import { synthesizeStrum } from "@/lib/audio/testSignals";
import { NoteDetector, DETECT_CONFIG } from "@/lib/input/detector";
import { ECHO_CONFIG, EchoGuard } from "@/lib/input/echoGuard";
import { chordMidis } from "@/lib/combat/spells";
import { buildSelfTest, scoreSelfTest, type TestItem } from "@/lib/input/selfTest";
import { pitchClassOf, type NoteEvent } from "@/lib/input/types";

const require = createRequire(import.meta.url);
setEssentiaInstance(new (require("essentia.js/dist/essentia.js-core.umd.js"))(require("essentia.js/dist/essentia-wasm.umd.js")));

const sr = 48000;
const skew = Number(process.argv.find((a) => a.startsWith("--skew="))?.slice(7) ?? 0);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

const VOICINGS: Record<string, { root: number; tones: number[] }> = {
  Em: { root: 40, tones: [52, 55, 59, 64] },
  C: { root: 36, tones: [48, 52, 55, 60] },
  G: { root: 43, tones: [50, 55, 59, 62] },
  D: { root: 38, tones: [50, 54, 57, 62] },
  Am: { root: 45, tones: [52, 57, 60, 64] },
};
const NOTE_HARMONY: Record<string, string> = { E: "Em", G: "G", A: "Am", B: "Em", D: "D", C: "C" };

// The level starts with a few seconds of walking: music, no playing yet
// (--no-intro: you're already playing when the music starts).
const INTRO = process.argv.includes("--no-intro") ? 0 : 4;
const SPB = 60 / 100;
const onBeat = process.argv.includes("--onbeat");

/** The guitar part: the self-test, or (--onbeat) strums on the music's beats. */
function buildGuitar(): { samples: Float32Array; items: TestItem[] } {
  if (!onBeat) return buildSelfTest(sr);
  const PROG = ["Em", "C", "G", "D"];
  const items: TestItem[] = [];
  const samples = new Float32Array(Math.round(36 * sr));
  for (let k = 0; k < 28; k++) {
    const b = 7 + 2 * k; // every other beat, from the first beat after the intro
    const t = 0.5 + b * SPB - INTRO + (rnd() - 0.5) * 0.03; // a good player: within 15 ms
    const chord = PROG[Math.floor(b / 4) % 4];
    items.push({ group: "On-beat chords", type: "chord", expect: chord, offsetSec: t });
    // Soft to firm strums.
    const s = synthesizeStrum(chordMidis(chord), sr, { seconds: 1.2, strumMs: 15, amp: 0.05 + (k % 5) * 0.025, seed: k + 1 });
    const off = Math.round(t * sr);
    for (let i = 0; i < s.length && off + i < samples.length; i++) samples[off + i] += s[i];
  }
  return { samples, items };
}

const test = buildGuitar();
const items = test.items.map((it) => ({ ...it, offsetSec: it.offsetSec + INTRO }));
const guitar = new Float32Array(test.samples.length + INTRO * sr);
guitar.set(test.samples, INTRO * sr);
const n = guitar.length;

/** The game's music as it leaves the speakers, plus what the game logs about it. */
function buildMusic(): { music: Float32Array; log: { at: number; until: number; pcs: string[] }[] } {
  const music = new Float32Array(n);
  const log: { at: number; until: number; pcs: string[] }[] = [];
  const add = (t: number, s: Float32Array, gain: number) => {
    const off = Math.round(t * sr);
    for (let i = 0; i < s.length && off + i < n; i++) music[off + i] += s[i] * gain;
  };
  const env = (len: number, attack: number, decay: number) =>
    Float32Array.from({ length: len }, (_, i) => Math.min(1, i / (attack * sr)) * Math.exp(-i / (decay * sr)));
  const tone = (t: number, dur: number, f0: number, f1: number, gain: number, pcs: string[] = []) => {
    const len = Math.round(dur * sr);
    const e = env(len, 0.004, dur / 4);
    let ph = 0;
    const s = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      ph += (f0 * (f1 / f0) ** (i / len)) / sr;
      s[i] = Math.sin(2 * Math.PI * ph) * e[i];
    }
    add(t, s, gain);
    log.push({ at: t * 1000, until: (t + dur) * 1000, pcs });
  };
  const noise = (t: number, dur: number, gain: number, hp: boolean) => {
    const len = Math.round(dur * sr);
    const e = env(len, 0.003, dur / 4);
    const s = new Float32Array(len);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      s[i] = (hp ? w - prev : w) * e[i];
      prev = w;
    }
    add(t, s, gain);
    log.push({ at: t * 1000, until: (t + dur) * 1000, pcs: [] });
  };
  const bass = (t: number, dur: number, midi: number, gain: number) => {
    const len = Math.round(dur * sr);
    const s = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const a = Math.min(1, i / (0.01 * sr)) * (0.6 + 0.4 * Math.exp(-i / (0.1 * sr))) * Math.min(1, (len - i) / (0.03 * sr));
      const p = (hz(midi) * i) / sr;
      s[i] = a * (Math.sin(2 * Math.PI * p) + 0.11 * Math.sin(6 * Math.PI * p));
    }
    add(t, s, gain);
    log.push({ at: t * 1000, until: (t + dur) * 1000, pcs: [pitchClassOf(midi)] });
  };
  const pad = (t: number, dur: number, midis: number[], gain: number) => {
    const len = Math.round((dur + 0.3) * sr);
    const s = new Float32Array(len);
    for (const m of midis)
      for (let i = 0; i < len; i++) {
        const a = Math.min(1, i / (0.06 * sr)) * (i > dur * sr ? Math.exp(-(i - dur * sr) / (0.15 * sr)) : 0.7 + 0.3 * Math.exp(-i / (0.3 * sr)));
        s[i] += a * Math.abs(((2 * hz(m) * i) / sr) % 2 - 1) * 2 - a;
      }
    add(t, s, gain);
    log.push({ at: t * 1000, until: (t + dur + 0.3) * 1000, pcs: midis.map(pitchClassOf) });
  };
  const strum = (t: number, midis: number[], gain: number) => {
    add(t, synthesizeStrum(midis, sr, { seconds: 1.2, strumMs: 18, amp: 0.25, seed: midis[0] }), gain);
    log.push({ at: t * 1000, until: (t + 1.2) * 1000, pcs: midis.map(pitchClassOf) });
  };

  const spb = 60 / 100;
  const half = spb / 2;
  const PROG = ["Em", "C", "G", "D"];
  // The "follow": after you play, the backing answers with your chord on the next half-beat.
  const follows = items
    .map((it) => ({ t: it.offsetSec, name: it.type === "chord" ? it.expect : NOTE_HARMONY[it.expect] }))
    .filter((f) => VOICINGS[f.name]);
  for (let b = 0, t = 0.5; t < n / sr - 0.5; b++, t += spb) {
    const beat = b % 4;
    const bar = Math.floor(b / 4);
    const f = [...follows].reverse().find((x) => x.t < t && t - x.t < spb * 8);
    const chord = VOICINGS[f?.name ?? PROG[bar % 4]];
    if (beat === 0 || beat === 2) tone(t, 0.32, 140, 42, 0.9);
    if (beat === 1 || beat === 3) noise(t, 0.18, 0.45, false);
    noise(t, 0.04, 0.12, true);
    noise(t + half, 0.04, 0.06, true);
    bass(t, half * 0.9, chord.root, 0.35);
    bass(t + half, half * 0.9, beat === 3 ? chord.root + 12 : chord.root, 0.3);
    if (beat === 0) strum(t, chord.tones, 0.28);
    if (beat === 1) strum(t + half, chord.tones.slice(1), 0.18);
  }
  for (const f of follows) {
    const at = Math.ceil((f.t - 0.5) / half) * half + 0.5 + (Math.ceil((f.t - 0.5) / half) * half + 0.5 - f.t < 0.02 ? half : 0);
    pad(at, spb * 2, VOICINGS[f.name].tones, 0.06);
    bass(at, half * 0.9, VOICINGS[f.name].root, 0.35);
  }
  return { music, log };
}

const built = buildMusic();
const music = built.music;
// A recorded song: the game only logs its beats, with unknown notes.
const log: { at: number; until: number; pcs: string[] | null }[] = process.argv.includes("--song")
  ? Array.from({ length: Math.floor((n / sr - 1) / SPB) }, (_, b) => ({ at: (0.5 + b * SPB) * 1000, until: (0.5 + (b + 1) * SPB) * 1000, pcs: null }))
  : built.log;

/** 2nd-order Butterworth high/low-pass (RBJ biquad, like a BiquadFilterNode with Q = 0.707). */
function biquad(x: Float32Array, f0: number, type: "highpass" | "lowpass"): Float32Array {
  const w = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cw = Math.cos(w);
  const a0 = 1 + alpha;
  const [b0, b1, b2] =
    type === "highpass" ? [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0] : [(1 - cw) / 2 / a0, (1 - cw) / a0, (1 - cw) / 2 / a0];
  const [a1, a2] = [(-2 * cw) / a0, (1 - alpha) / a0];
  const y = new Float32Array(x.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x[i], y1, v];
    y[i] = v;
  }
  return y;
}
const highpass = (x: Float32Array, f0: number) => biquad(x, f0, "highpass");
// What reaches the mic: laptop speakers barely play bass.
const leak = process.argv.includes("--flat") ? music : highpass(highpass(music, 200), 200);
// What the game's tap measures: its output, bass cut (see gameAudio.startTap).
const tapped = biquad(music, LEVEL_HIGHPASS_HZ, "highpass");
// The game logs each sound when it schedules it, up to ~250 ms ahead.
log.sort((a, b) => a.at - b.at);
const rmsOf = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
// What the game's output tap measures: the level of each 512-sample hop of the music.
const HOP = 512;
const outLevel = Array.from({ length: Math.floor(n / HOP) }, (_, i) => rmsOf(tapped.subarray(i * HOP, (i + 1) * HOP)));
const guitarRms = rmsOf(guitar);
// --why (no music) or --why=LEVEL: explain the misses at that speaker level.
const whyArg = process.argv.find((a) => a === "--why" || a.startsWith("--why="));
const whyLevel = whyArg === undefined ? NaN : whyArg === "--why" ? 0 : Number(whyArg.slice(6));
const musicRms = rmsOf(leak);

function run(level: number, guard: boolean) {
  clearOutputLog();
  let logged = 0;
  const k = (level * guitarRms) / musicRms;
  const mix = Float32Array.from(guitar, (v, i) => v + leak[i] * k);
  const det = new NoteDetector({ ...DETECT_CONFIG, ...JSON.parse(process.env.DETECT ?? "{}") });
  if (!guard && level === whyLevel) det.debug = (m) => why.push(`${(lastEnd / 1000).toFixed(3)} ${m}`);
  const echo = new EchoGuard({ ...ECHO_CONFIG, ...JSON.parse(process.env.ECHO ?? "{}") });
  let learnedAt: number | null = null;
  let maxCoupling = 0;
  const why: string[] = [];
  let lastEnd = 0;
  const learnAt = Number(process.argv.find((a) => a.startsWith("--learn="))?.slice(8) ?? NaN);
  if (guard && level === learnAt) echo.debug = (m) => console.log(`  ${m}`);
  const events: NoteEvent[] = [];
  const details = new Map<number, { rise?: number; leak: number | null }>();
  const checks: { t: number; what: string; real: boolean; echo: boolean; newSound: number; expected: number | null; factor: number }[] = [];
  let id = 1;
  let tapHops = 0;
  for (let end = DETECT_CONFIG.frameSize; end <= n; end += DETECT_CONFIG.hopSize) {
    const endTime = (end / sr) * 1000;
    lastEnd = endTime;
    while (logged < log.length && log[logged].at <= endTime + 250) {
      const l = log[logged++];
      logOutput({ at: l.at + skew, until: l.until + skew, pcs: l.pcs });
    }
    // The tap runs one output latency (~30 ms) ahead of what's heard.
    while (tapHops < outLevel.length && (((tapHops + 1) * HOP) / sr) * 1000 <= endTime + 30) {
      logOutputLevel((((tapHops + 1) * HOP) / sr) * 1000 + skew, outLevel[tapHops]);
      tapHops++;
    }
    const { detection } = det.push(mix.subarray(end - DETECT_CONFIG.frameSize, end), sr, endTime);
    echo.hop(endTime, mix.subarray(end - DETECT_CONFIG.hopSize, end), sr);
    if (learnedAt === null && echo.coupling !== null) learnedAt = endTime;
    if (echo.coupling !== null) maxCoupling = Math.max(maxCoupling, echo.coupling);
    if (!detection) continue;
    if (guard) {
      const isEcho = echo.check(detection);
      const what = detection.chord ?? detection.pitchClass;
      const real = test.items.some((it) => Math.abs(INTRO * 1000 + it.offsetSec * 1000 - detection.onsetTime) < 100 && it.expect === what);
      const l = echo.last!;
      checks.push({ t: detection.onsetTime, what, real, echo: isEcho, ...l });
      if (process.argv.includes("--why-ignored") && real && isEcho) {
        const t = detection.onsetTime;
        const on = outputOnsets(t - 150, t + 150).map((o) => `${Math.round(o.at - t)}[${o.pcs?.join("") ?? "?"}]`);
        const lv = outputLevels(t - 100, t + 80).reverse().map((v) => v.toFixed(2));
        console.log(`  L${level} ignored real ${what}@${(t / 1000).toFixed(3)} new ${l.newSound.toFixed(4)} expected ${l.expected?.toFixed(4)} peak ${detection.peakRms?.toFixed(3)} rise ${detection.rise?.toFixed(3)}`);
        console.log(`     game onsets (ms from mic onset): ${on.join(" ")}`);
        console.log(`     game level (above ${LEVEL_HIGHPASS_HZ} Hz) -100..+80 ms: ${lv.join(" ")}`);
      }
      if (isEcho) {
        det.retract();
        continue;
      }
    }
    details.set(id, { rise: detection.rise, leak: echo.expectedLeak(detection.onsetTime) });
    events.push({ id: id++, type: detection.type, pitchClass: detection.pitchClass, chord: detection.chord, midi: detection.midi, time: detection.onsetTime, confidence: detection.confidence, source: "mic" });
  }
  const res = scoreSelfTest(test.items, INTRO * 1000, events);
  if (process.argv.includes("--trace") && guard && level > 0) {
    // Ratio = the event's new sound / the leak expected at that moment. Echoes
    // should sit low, real playing high; the factor is the cut-off.
    const fmt = (x: (typeof checks)[number]) =>
      `${x.what}@${(x.t / 1000).toFixed(2)}${x.expected ? ` ${(x.newSound / x.expected).toFixed(1)}x/${x.factor}` : " (learning)"}${x.echo ? "!" : ""}`;
    console.log(`  L${level} real:  ${checks.filter((x) => x.real).map(fmt).join("  ")}`);
    console.log(`  L${level} fakes: ${checks.filter((x) => !x.real).map(fmt).join("  ")}`);
  }
  if (why.length) {
    // --why: the detector's reasoning around each guitar item it got wrong.
    for (const g of res.groups) console.log(`  ${g.group}: ${g.wrong.join(", ")}`);
    for (const it of test.items) {
      const t = (INTRO + it.offsetSec) * 1000;
      const ok = events.some((e) => Math.abs(e.time - t) < 100 && (e.chord ?? e.pitchClass) === it.expect);
      if (ok) continue;
      console.log(`  ${it.expect} @${(t / 1000).toFixed(2)}:`);
      for (const l of why) {
        const lt = Number(l.split(" ")[0]) * 1000;
        if (lt >= t - 20 && lt <= t + 250) console.log(`     ${l}`);
      }
    }
  }
  const hits = res.groups.reduce((s, g) => s + g.hits, 0);
  const total = res.groups.reduce((s, g) => s + g.total, 0);
  const realIgnored = checks.filter((x) => x.real && x.echo).length;
  return { hits, total, fake: res.extra.length, echoes: echo.echoes, leak: echo.coupling, learnedAt, realIgnored, maxCoupling };
}

console.log(`speaker level = music RMS as a fraction of the guitar's${skew ? `; latency estimate off by ${skew} ms` : ""}\n`);
console.log(`speaker: ${process.argv.includes("--flat") ? "flat" : "laptop (bass cut below ~200 Hz)"}`);
console.log("level   guard off: recall  fake    guard on: recall  fake  ignored (real)  coupling (max)  learned at");
for (const level of [0, 0.15, 0.3, 0.5, 0.8]) {
  const off = run(level, false);
  const on = run(level, true);
  console.log(
    `${level.toFixed(2).padEnd(8)}${`${off.hits}/${off.total}`.padStart(17)}${String(off.fake).padStart(6)}${`${on.hits}/${on.total}`.padStart(20)}${String(on.fake).padStart(6)}${String(on.echoes).padStart(9)} (${on.realIgnored})  ${(on.leak?.toFixed(3) ?? "-").padStart(8)} (${on.maxCoupling.toFixed(3)})  ${on.learnedAt === null ? "-" : `${(on.learnedAt / 1000).toFixed(1)} s`}`,
  );
}
