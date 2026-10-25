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
import { API_BASE, HAS_BACKEND, fileUrl } from "@/lib/pipeline";
import { BufferSong, ProceduralMusic, type MusicWorld, type SongClock } from "@/lib/game-audio/music";
import { bestChord, chordMidis, symbolForSongNote, type PlayMode } from "@/lib/combat/spells";

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

export interface ChordStep {
  t: number;
  chord: string;
}

/**
 * The song's harmony, beat by beat, fitted to the game's chords: every
 * transcribed note sounding in a beat counts (longer, louder and lower notes
 * count more), and the chord only changes when another one fits clearly better.
 */
export function chordTrack(notes: { t: number; dur?: number; midi: number; velocity?: number }[], beats: number[], duration: number): ChordStep[] {
  const grid = beats.length ? beats : [0];
  const track: ChordStep[] = [];
  let prev: string | null = null;
  // The key: how much each pitch class sounds over the whole song (0..1).
  const key: number[] = new Array(12).fill(0);
  for (const n of notes) key[n.midi % 12] += Math.max(n.dur ?? 0.25, 0.08) * ((n.velocity ?? 80) / 127);
  const keyMax = Math.max(...key) || 1;
  for (let i = 0; i < 12; i++) key[i] /= keyMax;
  for (let i = 0; i < grid.length; i++) {
    const t0 = grid[i];
    const t1 = i + 1 < grid.length ? grid[i + 1] : Math.min(duration, t0 + 0.5);
    const w: number[] = new Array(12).fill(0);
    let bass: number | null = null;
    for (const n of notes) {
      const a = Math.max(t0, n.t);
      const b = Math.min(t1, n.t + Math.max(n.dur ?? 0.25, 0.08));
      if (b <= a) continue;
      w[n.midi % 12] += (b - a) * ((n.velocity ?? 80) / 127) * (n.midi < 55 ? 1.6 : 1);
      if (bass === null || n.midi < bass) bass = n.midi;
    }
    if (w.every((x) => x < 1e-4)) {
      track.push({ t: t0, chord: prev ?? "Em" });
      continue;
    }
    const bassPc = bass === null ? null : bass % 12;
    // All seven chords the mic knows: songs in E or A major need the major ones.
    const best = bestChord(w, bassPc, SONG_CHORDS, key);
    if (prev && prev !== best.chord && bestChord(w, bassPc, [prev], key).score > best.score - 0.12) {
      track.push({ t: t0, chord: prev });
      continue;
    }
    prev = best.chord;
    track.push({ t: t0, chord: best.chord });
  }
  return track;
}

/** The chord sounding at song time `t`. */
export function chordAt(track: ChordStep[], t: number): string {
  let lo = 0;
  let hi = track.length - 1;
  if (hi < 0) return "Em";
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track[mid].t <= t + 0.05) lo = mid;
    else hi = mid - 1;
  }
  return track[lo].chord;
}

const CHORD_ROOT: Record<string, string> = { Em: "E", G: "G", D: "D", C: "C", Am: "A", A: "A", E: "E" };
const SONG_CHORDS = ["Em", "G", "D", "C", "Am", "A", "E"];

/**
 * Howls from a song. `track` (the song's harmony) makes chord howls match what
 * the music is playing at that moment; single-note howls are the song's real notes.
 */
export function planFight(notes: { t: number; pc: string }[], beats: number[], bpm: number, duration: number, mode: PlayMode, track?: ChordStep[]): { attacks: Attack[]; phases: Phase[] } {
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
      const symbol = mode === "chords" && track ? chordAt(track, n.t) : symbolForSongNote(n.pc, mode);
      picked.push({ t: n.t, symbol });
    }
    // Sparse chart (quiet guitar, intro...): add riff howls on the beat.
    if (picked.length < 4) {
      for (const t of grid.filter((g) => g >= ph.start && g < ph.end - period)) {
        const beatIdx = Math.round((t - ph.start) / period);
        if (beatIdx % step) continue;
        if (picked.some((p) => Math.abs(p.t - t) < minGap)) continue;
        // On the song's own harmony when we know it (the chord, or its root note).
        const fromSong = track ? chordAt(track, t) : null;
        picked.push({ t, symbol: fromSong ? (mode === "chords" ? fromSong : CHORD_ROOT[fromSong] ?? "E") : riff[riffI++ % riff.length] });
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
  if (!HAS_BACKEND) return []; // the public site: the demo song
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
  // The harmony from every transcribed note (the hard chart has the most).
  const track = chordTrack(chart.difficulties.hard ?? chart.difficulties.easy, chart.beats, clock.duration);
  const { attacks, phases } = planFight(notes, chart.beats, chart.song.bpm, clock.duration, mode, track);
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
