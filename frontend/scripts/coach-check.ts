/**
 * Checks the lute's coach without a backend: what a miss was aimed at, the run summary (the same
 * rules as the SQL in backend/app/tiger.py), and the built-in tips.
 *   npx tsx scripts/coach-check.ts
 */

import { localAdvice, shapeFix } from "@/lib/coach/advice";
import { guessTarget, summarizeRun } from "@/lib/coach/summary";
import type { PlayRecord } from "@/lib/coach/types";

let failed = 0;
function eq(got: unknown, want: unknown, what: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}

// What a miss was aimed at: the wanted chord sharing the most notes with what was heard.
eq(guessTarget("Am", ["G", "C"], "chords"), "C", "Am aimed at C, not G");
eq(guessTarget("F", ["E", "A"], "notes"), "E", "F aimed at E (nearest note)");
eq(guessTarget("E note", ["Em", "D"], "chords"), "Em", "a single E note aimed at Em");
eq(guessTarget("D", [], "chords"), null, "nothing wanted: no target");

// Mix-ups explained by comparing chord boxes.
eq(shapeFix("C", "Am"), "press the A string at fret 3 with your ring finger, and let the G string ring open", "C from Am");
eq(shapeFix("G", "Em"), "press the low E string at fret 3 with your middle finger, and press the high e string at fret 3 with your ring finger", "G from Em");

let clock = 0;
const play = (target: string, played: string, hit: boolean): PlayRecord => ({
  t: new Date(1.7e12 + (clock += 1000)).toISOString(),
  levelId: "1-1",
  world: "forest",
  scene: "Journey",
  mode: "chords",
  input: "mic",
  practice: false,
  played,
  target,
  wanted: [target],
  hit,
  grade: hit ? "good" : null,
  offsetMs: hit ? -60 : null,
  confidence: 0.9,
  latencyMs: 85,
});
const ctx = { levels: ["1-1"], world: "forest", seconds: 61, mode: "chords" as const, input: "mic" as const, practice: false, slain: 7 };
// G then C, where C comes out as Am twice.
const plays = [
  play("Em", "Em", true),
  play("G", "G", true),
  play("C", "Am", false),
  play("C", "C", true),
  play("G", "G", true),
  play("C", "Am", false),
  play("C", "C", true),
  play("G", "G", true),
  play("C", "C", true),
  play("Em", "Em", true),
];
const s = summarizeRun(plays, { ...ctx, victory: false, maxCombo: 4 });
eq([s.tries, s.hits], [10, 8], "tries and hits");
eq(s.chords[0], { chord: "C", tries: 5, hits: 3, heardAs: { Am: 2 } }, "C first, heard as Am twice");
eq(s.changes.find((c) => c.from === "G" && c.to === "C"), { from: "G", to: "C", changes: 3, firstTry: 1 }, "G to C: first strum 1 of 3");
eq(s.timing?.meanMs, -60, "timing: 60 ms early");

const a = localAdvice(s, null);
eq(a.focus, "G to C", "focus: the change");
eq(a.drill?.chords, ["G", "C"], "drill: the change");
eq(a.headline, "So close! Let's fix your G to C.", "a defeat's headline names the fix");
eq(a.tips[0].title, "C, not Am", "first tip: the mix-up");

const flawless = localAdvice(summarizeRun(plays.filter((p) => p.hit), { ...ctx, victory: true, maxCombo: 8 }), null);
eq(flawless.drill, null, "a flawless run: no drill");
eq(flawless.goal, "Beat your best combo of 8.", "a flawless run: a combo goal");

const keys = localAdvice(summarizeRun(plays.map((p) => ({ ...p, input: "keyboard" as const })), { ...ctx, victory: false, maxCombo: 4 }), null);
eq(keys.tips[0].title, "Now try it on your guitar", "keyboard players are sent to the guitar");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exitCode = failed ? 1 : 0;
