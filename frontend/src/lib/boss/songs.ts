/**
 * Songs for the Big Bad Wolf fight.
 *
 * A processed song (backend chart.json + backing.mp3) or the built-in demo.
 * The easy-difficulty notes become "howls": each one carries a symbol the
 * player must play as it arrives (a chord in chord mode, mapped from the song
 * note; an open-string note in notes mode).
 *
 * The fight alternates phases (counted in beats from the first downbeat):
 *   intro (2 bars) -> howls (4 bars) -> pack (4 bars) -> howls -> pack ...
 */

import type { Chart } from "@/lib/pipeline";
import { API_BASE, fileUrl } from "@/lib/pipeline";
import { BufferSong, ProceduralMusic, type MusicWorld, type SongClock } from "@/lib/game-audio/music";
import { chordMidis, symbolForSongNote, type PlayMode } from "@/lib/combat/spells";

export interface Attack {
  /** Song seconds. */
  t: number;
  symbol: string;
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

/** Beat times covering the whole song (extends the grid past the last beat). */
function fullGrid(beats: number[], bpm: number, duration: number): number[] {
  const period = 60 / bpm;
  const out = beats.length ? [...beats] : [0];
  while (out[out.length - 1] + period < duration) out.push(out[out.length - 1] + period);
  return out;
}

/** Chords need time to change shape; single notes can come faster. */
export function minGapFor(mode: PlayMode, bpm: number): number {
  const period = 60 / bpm;
  return mode === "chords" ? Math.max(1.05, period * 1.9) : Math.max(0.5, period * 0.95);
}

export function planFight(notes: { t: number; pc: string }[], beats: number[], bpm: number, duration: number, mode: PlayMode): { attacks: Attack[]; phases: Phase[] } {
  const grid = fullGrid(beats, bpm, duration);
  const period = 60 / bpm;
  const minGap = minGapFor(mode, bpm);
  const phases: Phase[] = [];
  const at = (i: number) => (i < grid.length ? grid[i] : grid[grid.length - 1] + (i - grid.length + 1) * period);
  phases.push({ kind: "intro", start: 0, end: at(PHASE_BEATS.intro) });
  let b = PHASE_BEATS.intro;
  let parry = true;
  while (at(b) < duration - 1) {
    const len = parry ? PHASE_BEATS.parry : PHASE_BEATS.free;
    phases.push({ kind: parry ? "parry" : "free", start: at(b), end: Math.min(duration, at(b + len)) });
    b += len;
    parry = !parry;
  }

  const riff = mode === "chords" ? ["Em", "G", "D", "C", "Em", "Am", "G", "D"] : ["E", "G", "A", "D", "E", "A", "G", "D"];
  const step = mode === "chords" ? 2 : 2; // fill-in howls every other beat (at least minGap apart)
  const attacks: Attack[] = [];
  let riffI = 0;
  for (const ph of phases.filter((p) => p.kind === "parry")) {
    // Leave the last beat of a phase free so howls don't spill over.
    const usable = notes.filter((n) => n.t >= ph.start && n.t < ph.end - period);
    const picked: Attack[] = [];
    for (const n of usable) {
      if (picked.length && n.t - picked[picked.length - 1].t < minGap) continue;
      picked.push({ t: n.t, symbol: symbolForSongNote(n.pc, mode) });
    }
    // Sparse chart (quiet guitar, intro...): add riff howls on the beat.
    if (picked.length < 4) {
      for (const t of grid.filter((g) => g >= ph.start && g < ph.end - period)) {
        const beatIdx = Math.round((t - ph.start) / period);
        if (beatIdx % step) continue;
        if (picked.some((p) => Math.abs(p.t - t) < minGap)) continue;
        picked.push({ t, symbol: riff[riffI++ % riff.length] });
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

export async function loadJobSong(jobId: string, mode: PlayMode, signal?: AbortSignal): Promise<BossSong> {
  const res = await fetch(fileUrl(jobId, "chart.json"), { cache: "no-store", signal });
  if (!res.ok) throw new Error(`chart.json for ${jobId}: HTTP ${res.status}`);
  const chart = (await res.json()) as Chart;
  const clock = await BufferSong.load(fileUrl(jobId, "backing.mp3"), chart.beats, chart.song.bpm, signal);
  const notes = chart.difficulties.easy.map((n) => ({ t: n.t, pc: n.name.replace(/-?\d+$/, "") }));
  const { attacks, phases } = planFight(notes, chart.beats, chart.song.bpm, clock.duration, mode);
  return { title: chart.song.title, source: "job", bpm: chart.song.bpm, duration: clock.duration, clock, attacks, phases };
}

const NOTE_MIDI: Record<string, number> = { E: 64, G: 67, A: 69, B: 71, D: 74, C: 72 };

/** Built-in demo: a synthesized E-minor groove (in the world's style) whose lead line plays the howls. */
export function demoSong(mode: PlayMode, opts: { bpm?: number; world?: MusicWorld; title?: string } = {}): BossSong {
  const bpm = opts.bpm ?? 104;
  const bars = 40;
  const period = 60 / bpm;
  const duration = bars * 4 * period;
  const beats = Array.from({ length: bars * 4 }, (_, i) => i * period);
  const patterns = mode === "chords"
    ? [["Em", "G", "Em", "D"], ["Em", "C", "G", "D"], ["C", "G", "Am", "Em"]]
    : [["E", "G", "A", "G"], ["E", "A", "D", "G"], ["A", "G", "E", "D"]];
  const notes: { t: number; pc: string }[] = [];
  let phaseNo = 0;
  const every = mode === "chords" ? 2 : 1;
  for (let b = PHASE_BEATS.intro; b < bars * 4; b += PHASE_BEATS.parry + PHASE_BEATS.free) {
    const pat = patterns[phaseNo % patterns.length];
    let k = 0;
    for (let i = 0; i < PHASE_BEATS.parry - 1; i += every * (phaseNo === 0 && mode === "notes" ? 2 : 1)) {
      // Song notes whose mapped symbol is the pattern's symbol.
      const sym = pat[k++ % pat.length];
      notes.push({ t: (b + i) * period, pc: mode === "chords" ? ({ Em: "E", G: "G", D: "D", C: "C", Am: "A" } as Record<string, string>)[sym] : sym });
    }
    phaseNo++;
  }
  const { attacks, phases } = planFight(notes, beats, bpm, duration, mode);
  const lead = attacks.map((a) => ({ t: a.t, midi: mode === "chords" ? chordMidis(a.symbol) : NOTE_MIDI[a.symbol] ?? 64 }));
  const clock = new ProceduralMusic({ bpm, bars, world: opts.world ?? "forest", boss: true, lead });
  return { title: `${opts.title ?? "The Wolf's Waltz"} (built-in demo)`, source: "demo", bpm, duration, clock, attacks, phases };
}
