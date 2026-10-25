/**
 * Does the mic detector read a REAL guitar correctly? Runs it over a WAV from
 * the song pipeline (a real recording) and compares what it hears with the
 * song's notes (the transcribed chart), note by note.
 *   npx tsx scripts/real-audio-check.ts <jobId> [guitar|input] [--list]
 * e.g. the Twinkle Twinkle play-along: npx tsx scripts/real-audio-check.ts 0302f33525181fe6 input
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setEssentiaInstance } from "@/lib/audio/essentia";
import { DETECT_CONFIG, NoteDetector } from "@/lib/input/detector";
import { PITCH_CLASSES } from "@/lib/input/types";

const require = createRequire(import.meta.url);
setEssentiaInstance(new (require("essentia.js/dist/essentia.js-core.umd.js"))(require("essentia.js/dist/essentia-wasm.umd.js")));

/** Minimal WAV reader: PCM 16/24/32-bit or float32, any channels -> mono. */
function readWav(path: string): { sr: number; samples: Float32Array } {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV");
  let off = 12;
  let fmt = { format: 1, ch: 1, sr: 44100, bits: 16 };
  while (off < b.length - 8) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") fmt = { format: b.readUInt16LE(body), ch: b.readUInt16LE(body + 2), sr: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === "data") {
      const bytes = fmt.bits / 8;
      const frames = Math.floor(size / (bytes * fmt.ch));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < fmt.ch; c++) {
          const p = body + (i * fmt.ch + c) * bytes;
          if (fmt.format === 3) sum += b.readFloatLE(p);
          else if (fmt.bits === 16) sum += b.readInt16LE(p) / 32768;
          else if (fmt.bits === 24) sum += b.readIntLE(p, 3) / 8388608;
          else sum += b.readInt32LE(p) / 2147483648;
        }
        out[i] = sum / fmt.ch;
      }
      return { sr: fmt.sr, samples: out };
    }
    off = body + size + (size % 2);
  }
  throw new Error("no data chunk");
}

const [jobId = "0302f33525181fe6", which = "input"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dir = join(process.cwd(), "..", "backend", "data", "jobs", jobId);
const chart = JSON.parse(readFileSync(join(dir, "chart.json"), "utf8"));
const { sr, samples: raw } = readWav(join(dir, `${which}.wav`));
// --highpass=250 removes a backing's bass notes, leaving the melody (what a player alone would sound like).
const hpArg = process.argv.find((a) => a.startsWith("--highpass="));
const samples = hpArg ? highpass(raw, sr, Number(hpArg.slice(11))) : raw;

/** 2nd-order Butterworth high-pass, applied twice (24 dB/oct). */
function highpass(x: Float32Array, rate: number, hz: number): Float32Array {
  let y = Float32Array.from(x);
  for (let pass = 0; pass < 2; pass++) {
    const w = (2 * Math.PI * hz) / rate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / Math.SQRT2;
    const a0 = 1 + alpha;
    const b0 = (1 + cos) / 2 / a0;
    const b1 = -(1 + cos) / a0;
    const b2 = (1 + cos) / 2 / a0;
    const a1 = (-2 * cos) / a0;
    const a2 = (1 - alpha) / a0;
    const out = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = y[i];
      y2 = y1;
      y1 = v;
      out[i] = v;
    }
    y = out;
  }
  return y;
}

// DETECT='{"noteAttackHops":6}' tries other detector settings.
const det = new NoteDetector({ ...DETECT_CONFIG, ...JSON.parse(process.env.DETECT ?? "{}") });
// --trace=13.4-14.3 prints the detector's reasoning in that time window (seconds).
const tr = process.argv.find((a) => a.startsWith("--trace="))?.slice(8).split("-").map(Number);
let nowSec = 0;
if (tr) det.debug = (m) => nowSec >= tr[0] && nowSec <= tr[1] && console.log(`  ${nowSec.toFixed(3)} ${m}`);
const heard: { t: number; label: string; pc: string; chord?: string; conf: number }[] = [];
for (let end = DETECT_CONFIG.frameSize; end <= samples.length; end += DETECT_CONFIG.hopSize) {
  nowSec = end / sr;
  const { detection: d } = det.push(samples.subarray(end - DETECT_CONFIG.frameSize, end), sr, (end / sr) * 1000);
  if (d) heard.push({ t: d.onsetTime / 1000, label: d.chord ?? d.pitchClass, pc: d.pitchClass, chord: d.chord, conf: d.confidence });
}

// Reference: the chart's medium notes in the melody's register (the bass part
// of the backing is lower); when several start together, the highest one.
// --ref=twinkle uses the true melody instead (the transcription has errors):
// Twinkle Twinkle in E, one note per second from 3.69 s, half notes at line ends.
type Ref = { t: number; pc: string; name: string };
const refs: Ref[] = [];
if (process.argv.includes("--ref=twinkle")) {
  const lines = [
    ["E", "E", "B", "B", "C#", "C#", "B"],
    ["A", "A", "G#", "G#", "F#", "F#", "E"],
    ["B", "B", "A", "A", "G#", "G#", "F#"],
    ["B", "B", "A", "A", "G#", "G#", "F#"],
    ["E", "E", "B", "B", "C#", "C#", "B"],
    ["A", "A", "G#", "G#", "F#", "F#", "E"],
  ];
  lines.forEach((line, li) => line.forEach((pc, i) => refs.push({ t: 3.69 + li * 8 + i, pc, name: pc })));
} else {
  const notes: { t: number; midi: number; name: string }[] = chart.difficulties.medium;
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    if (n.midi < 60) continue;
    const last = refs[refs.length - 1];
    const pc = PITCH_CLASSES[n.midi % 12];
    if (last && Math.abs(last.t - n.t) < 0.06) continue;
    refs.push({ t: n.t, pc, name: n.name });
  }
}

let found = 0;
let right = 0;
const misses: string[] = [];
const wrong: string[] = [];
const used = new Set<number>();
for (const r of refs) {
  let best = -1;
  for (let i = 0; i < heard.length; i++) {
    if (used.has(i) || Math.abs(heard[i].t - r.t) > 0.12) continue;
    if (best < 0 || Math.abs(heard[i].t - r.t) < Math.abs(heard[best].t - r.t)) best = i;
  }
  if (best < 0) {
    misses.push(`${r.name}@${r.t.toFixed(2)}`);
    continue;
  }
  used.add(best);
  found++;
  if (heard[best].pc === r.pc) right++;
  else wrong.push(`${r.name}@${r.t.toFixed(2)} heard ${heard[best].label}`);
}
const extra = heard.filter((_, i) => !used.has(i));

console.log(`${chart.song.title} — ${which}.wav (${sr} Hz, ${(samples.length / sr).toFixed(1)} s)`);
console.log(`song notes (melody register): ${refs.length}`);
console.log(`heard at the right moment: ${found}/${refs.length} (${Math.round((100 * found) / Math.max(1, refs.length))}%)`);
console.log(`...and the right note: ${right}/${found} (${Math.round((100 * right) / Math.max(1, found))}%)`);
console.log(`other events (not on a song note): ${extra.length}`);
if (wrong.length) console.log(`wrong note: ${wrong.slice(0, 12).join(", ")}${wrong.length > 12 ? " ..." : ""}`);
if (misses.length) console.log(`missed: ${misses.slice(0, 12).join(", ")}${misses.length > 12 ? " ..." : ""}`);
if (process.argv.includes("--list")) {
  console.log("\nheard:");
  for (const h of heard) console.log(`  ${h.t.toFixed(2)} ${h.label} ${h.conf.toFixed(2)}`);
}
