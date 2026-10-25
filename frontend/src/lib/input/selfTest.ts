/**
 * Self-test without a guitar: synthesizes plucks and strums (Karplus-Strong,
 * realistic harmonics and decay), plays them through the exact same pipeline
 * as the mic, and scores what the detector emitted.
 */

import { synthesizeStrum } from "@/lib/audio/testSignals";
import type { NoteEvent } from "./types";

export interface TestItem {
  group: string;
  type: "note" | "chord";
  /** Pitch class for notes, chord name for chords. */
  expect: string;
  offsetSec: number;
}

const SHAPES: Record<string, number[]> = {
  Em: [40, 47, 52, 55, 59, 64], // 022000
  G: [43, 47, 50, 55, 59, 67], // 320003
  C: [48, 52, 55, 60, 64], // x32010
  D: [50, 57, 62, 66], // xx0232
  Am: [45, 52, 57, 60, 64], // x02210
};
const NOTE_MIDI: Record<string, number[]> = { E: [40, 52, 64], G: [43, 55, 67], A: [45, 57, 69], B: [47, 59, 71], D: [50, 62, 74] };

export const SELF_TEST_GROUPS = ["Single notes", "Em chord", "E → G notes", "Chord changes (Em G D C Am)"] as const;

export function buildSelfTest(sampleRate: number): { samples: Float32Array<ArrayBuffer>; items: TestItem[]; seconds: number } {
  const items: { item: TestItem; midis: number[]; strumMs: number; amp: number }[] = [];
  let t = 0.3;
  let seed = 1;
  const add = (group: string, type: "note" | "chord", expect: string, midis: number[], gap: number) => {
    items.push({ item: { group, type, expect, offsetSec: t }, midis, strumMs: type === "chord" ? 10 + (seed % 3) * 5 : 0, amp: 0.08 + (seed % 4) * 0.02 });
    seed++;
    t += gap;
  };

  // 10 single notes: E on three strings, plus the other open-string notes.
  const singles = ["E", "E", "E", "G", "A", "E", "B", "D", "E", "A"];
  singles.forEach((pc, i) => add("Single notes", "note", pc, [NOTE_MIDI[pc][i % 3]], 0.7));
  t += 0.4;
  for (let i = 0; i < 10; i++) add("Em chord", "chord", "Em", SHAPES.Em, 0.9);
  t += 0.4;
  for (let i = 0; i < 10; i++) {
    const oct = i % 2;
    add("E → G notes", "note", "E", [NOTE_MIDI.E[oct + 1]], 0.3);
    add("E → G notes", "note", "G", [NOTE_MIDI.G[oct]], 0.8);
  }
  t += 0.4;
  // The foes' chords, changing every 0.9 s (strings from the last chord still ring).
  for (let i = 0; i < 2; i++) {
    for (const ch of ["Em", "G", "D", "C", "Am"]) add("Chord changes (Em G D C Am)", "chord", ch, SHAPES[ch], 0.9);
  }

  const seconds = t + 1.5;
  const out = new Float32Array(Math.round(seconds * sampleRate));
  // A little noise floor, like a real room.
  let r = 12345;
  for (let i = 0; i < out.length; i++) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((r / 0x7fffffff) * 2 - 1) * 0.0008;
  }
  items.forEach(({ item, midis, strumMs, amp }, i) => {
    const s = synthesizeStrum(midis, sampleRate, { seconds: 1.2, strumMs, amp, seed: i + 3 });
    const off = Math.round(item.offsetSec * sampleRate);
    // What's still ringing drops to 30% over ~25 ms (fingers lift / strings
    // re-struck), but keeps ringing underneath the new note.
    for (let j = off; j < out.length; j++) out[j] *= j - off < 1200 ? 1 - ((j - off) / 1200) * 0.7 : 0.3;
    for (let j = 0; j < s.length && off + j < out.length; j++) out[off + j] += s[j];
  });
  return { samples: out, items: items.map((x) => x.item), seconds };
}

export interface GroupResult {
  group: string;
  total: number;
  hits: number;
  wrong: string[];
  latencyMedian: number | null;
  onsetErrorMedian: number | null;
}

/** Match events to expected items (onset within -40..+150 ms). */
export function scoreSelfTest(items: TestItem[], startPerf: number, events: NoteEvent[]): { groups: GroupResult[]; extra: NoteEvent[] } {
  const used = new Set<number>();
  const per = new Map<string, { hits: number; total: number; wrong: string[]; lat: number[]; err: number[] }>();
  for (const it of items) {
    const g = per.get(it.group) ?? { hits: 0, total: 0, wrong: [], lat: [], err: [] };
    per.set(it.group, g);
    g.total++;
    const at = startPerf + it.offsetSec * 1000;
    const ev = events.find((e) => !used.has(e.id) && e.time - at >= -40 && e.time - at <= 150);
    if (!ev) {
      g.wrong.push(`${it.expect}: missed`);
      continue;
    }
    used.add(ev.id);
    const got = ev.type === "chord" ? ev.chord : ev.pitchClass;
    if (ev.type === it.type && got === it.expect) {
      g.hits++;
      if (ev.latencyMs !== undefined) g.lat.push(ev.latencyMs);
      g.err.push(ev.time - at);
    } else {
      g.wrong.push(`${it.expect}: heard ${ev.type === "chord" ? `${got} chord` : got}`);
    }
  }
  const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
  return {
    groups: [...per.entries()].map(([group, g]) => ({
      group,
      total: g.total,
      hits: g.hits,
      wrong: g.wrong,
      latencyMedian: med(g.lat),
      onsetErrorMedian: med(g.err),
    })),
    extra: events.filter((e) => !used.has(e.id)),
  };
}
