/**
 * Prints the harmony the boss fight will use for a processed song (one chord
 * per bar, from every transcribed note), next to the song's notes in that bar.
 *   npx tsx scripts/song-chords.ts <jobId>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chordAt, chordTrack } from "@/lib/boss/songs";

const jobId = process.argv[2] ?? "0302f33525181fe6";
const chart = JSON.parse(readFileSync(join(process.cwd(), "..", "backend", "data", "jobs", jobId, "chart.json"), "utf8"));
const notes = chart.difficulties.hard as { t: number; dur: number; midi: number; name: string; velocity: number }[];
const track = chordTrack(notes, chart.beats, chart.song.durationSec);
console.log(`${chart.song.title} (${Math.round(chart.song.bpm)} BPM)`);
const bar = (60 / chart.song.bpm) * 4;
for (let t = chart.beats[0] ?? 0; t < chart.song.durationSec; t += bar) {
  const inBar = notes.filter((n) => n.t >= t && n.t < t + bar).map((n) => n.name.replace(/\d+$/, ""));
  const counts = new Map<string, number>();
  for (const n of inBar) counts.set(n, (counts.get(n) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}${c > 1 ? `×${c}` : ""}`).join(" ");
  const chords = [0, 0.25, 0.5, 0.75].map((f) => chordAt(track, t + f * bar));
  console.log(`${t.toFixed(1).padStart(6)}s  ${chords.join(" ").padEnd(16)} | ${top}`);
}
