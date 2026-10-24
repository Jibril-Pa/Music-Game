/**
 * Songs for the Big Bad Wolf fight.
 *
 * A processed song (backend chart.json + backing.mp3) or the built-in demo.
 * The easy-difficulty notes become telegraphed attacks. Each note is mapped
 * to the nearest open-string note (E G A B D: E minor pentatonic) so every
 * attack can be parried on open strings or with the Z X C V B keys.
 *
 * The fight alternates phases (counted in beats from the first downbeat):
 *   intro (2 bars) -> parry (4 bars) -> free (4 bars) -> parry -> free ...
 */

import type { Chart } from "@/lib/pipeline";
import { API_BASE, fileUrl } from "@/lib/pipeline";
import { BufferSong, ProceduralMusic, type SongClock } from "@/lib/game-audio/music";
import type { PitchClass } from "@/lib/input/types";

export const PLAYABLE: PitchClass[] = ["E", "G", "A", "B", "D"];
const PC_INDEX: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

export interface Attack {
  /** Song seconds. */
  t: number;
  pc: PitchClass;
}

export interface Phase {
  kind: "intro" | "parry" | "free";
  start: number;
  end: number;
}

export interface BossSong {
  title: string;
  source: "demo" | "job";
  bpm: number;
  duration: number;
  clock: SongClock;
  attacks: Attack[];
  phases: Phase[];
}

export const PHASE_BEATS = { intro: 8, parry: 16, free: 16 };

export function toPlayable(pc: string): PitchClass {
  const i = PC_INDEX[pc] ?? 4;
  let best: PitchClass = "E";
  let bestD = 99;
  for (const p of PLAYABLE) {
    const d = Math.min((i - PC_INDEX[p] + 12) % 12, (PC_INDEX[p] - i + 12) % 12);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Beat times covering the whole song (extends the grid past the last beat). */
function fullGrid(beats: number[], bpm: number, duration: number): number[] {
  const period = 60 / bpm;
  const out = beats.length ? [...beats] : [0];
  while (out[out.length - 1] + period < duration) out.push(out[out.length - 1] + period);
  return out;
}

export function planFight(notes: { t: number; pc: string }[], beats: number[], bpm: number, duration: number): { attacks: Attack[]; phases: Phase[] } {
  const grid = fullGrid(beats, bpm, duration);
  const period = 60 / bpm;
  const minGap = Math.max(0.42, period * 0.95);
  const phases: Phase[] = [];
  let b = 0;
  const at = (i: number) => (i < grid.length ? grid[i] : grid[grid.length - 1] + (i - grid.length + 1) * period);
  phases.push({ kind: "intro", start: 0, end: at(PHASE_BEATS.intro) });
  b = PHASE_BEATS.intro;
  let parry = true;
  while (at(b) < duration - 1) {
    const len = parry ? PHASE_BEATS.parry : PHASE_BEATS.free;
    phases.push({ kind: parry ? "parry" : "free", start: at(b), end: Math.min(duration, at(b + len)) });
    b += len;
    parry = !parry;
  }

  const riff: PitchClass[] = ["E", "G", "A", "G", "E", "D", "E", "B"];
  const attacks: Attack[] = [];
  let riffI = 0;
  for (const ph of phases.filter((p) => p.kind === "parry")) {
    // Leave the last beat of a parry phase free so attacks don't spill over.
    const usable = notes.filter((n) => n.t >= ph.start && n.t < ph.end - period);
    const picked: Attack[] = [];
    for (const n of usable) {
      if (picked.length && n.t - picked[picked.length - 1].t < minGap) continue;
      picked.push({ t: n.t, pc: toPlayable(n.pc) });
    }
    // Sparse chart (quiet guitar, intro...): add riff notes on every other beat.
    if (picked.length < 6) {
      for (const t of grid.filter((g) => g >= ph.start && g < ph.end - period)) {
        const beatIdx = Math.round((t - ph.start) / period);
        if (beatIdx % 2) continue;
        if (picked.some((p) => Math.abs(p.t - t) < minGap)) continue;
        picked.push({ t, pc: riff[riffI++ % riff.length] });
      }
      picked.sort((x, y) => x.t - y.t);
    }
    attacks.push(...picked);
  }
  return { attacks, phases };
}

// ------------------------------------------------------------------ sources

export interface JobSongInfo {
  jobId: string;
  title: string;
  source?: string;
  bpm?: number;
  durationSec?: number;
}

export async function listProcessedSongs(): Promise<JobSongInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/jobs`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!res.ok) return [];
    const jobs = (await res.json()).jobs as (JobSongInfo & { status: string })[];
    return jobs.filter((j) => j.status === "done");
  } catch {
    return []; // backend not running: the demo song still works
  }
}

export async function loadJobSong(jobId: string, signal?: AbortSignal): Promise<BossSong> {
  const res = await fetch(fileUrl(jobId, "chart.json"), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`chart.json for ${jobId}: HTTP ${res.status}`);
  const chart = (await res.json()) as Chart;
  const clock = await BufferSong.load(fileUrl(jobId, "backing.mp3"), chart.beats, chart.song.bpm, signal);
  const notes = chart.difficulties.easy.map((n) => ({ t: n.t, pc: n.name.replace(/-?\d+$/, "") }));
  const { attacks, phases } = planFight(notes, chart.beats, chart.song.bpm, clock.duration);
  return { title: chart.song.title, source: "job", bpm: chart.song.bpm, duration: clock.duration, clock, attacks, phases };
}

const LEAD_MIDI: Record<string, number> = { E: 64, G: 67, A: 69, B: 71, D: 74 };

/** Built-in demo: a synthesized E-minor groove whose lead line is the attacks. */
export function demoSong(): BossSong {
  const bpm = 104;
  const bars = 40;
  const period = 60 / bpm;
  const duration = bars * 4 * period;
  const beats = Array.from({ length: bars * 4 }, (_, i) => i * period);
  // Lead melody: quarter notes, denser in later phases.
  const patterns: PitchClass[][] = [
    ["E", "G", "A", "G", "E", "D", "E", "B"],
    ["E", "G", "A", "B", "A", "G", "E", "D"],
    ["A", "G", "E", "G", "A", "B", "D", "E"],
  ];
  const notes: { t: number; pc: string }[] = [];
  let phaseNo = 0;
  for (let b = PHASE_BEATS.intro; b < bars * 4; b += PHASE_BEATS.parry + PHASE_BEATS.free) {
    const pat = patterns[phaseNo % patterns.length];
    const step = phaseNo === 0 ? 2 : phaseNo < 3 ? 2 : 1; // later: every beat
    let k = 0;
    for (let i = 0; i < PHASE_BEATS.parry - 1; i += step) notes.push({ t: (b + i) * period, pc: pat[k++ % pat.length] });
    phaseNo++;
  }
  const { attacks, phases } = planFight(notes, beats, bpm, duration);
  const clock = new ProceduralMusic({ bpm, bars, style: "boss", lead: attacks.map((a) => ({ t: a.t, midi: LEAD_MIDI[a.pc] })) });
  return { title: "The Wolf's Waltz (built-in demo)", source: "demo", bpm, duration, clock, attacks, phases };
}
