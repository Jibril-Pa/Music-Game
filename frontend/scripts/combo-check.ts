/** Checks the combo rules: npx tsx scripts/combo-check.ts */
import { ComboEngine } from "@/lib/combat/combos";
import type { NoteEvent } from "@/lib/input/types";

let id = 1;
const note = (pc: string, time: number): NoteEvent => ({ id: id++, type: "note", pitchClass: pc as NoteEvent["pitchClass"], time, confidence: 1, source: "keyboard" });
const chord = (ch: string, time: number): NoteEvent => ({ id: id++, type: "chord", pitchClass: "E", chord: ch as NoteEvent["chord"], time, confidence: 1, source: "keyboard" });

function run(name: string, events: NoteEvent[], magicFull: boolean, expect: string[]) {
  const e = new ComboEngine();
  const got = events.map((ev) => e.push(ev, { magicFull, practice: false }).move.id);
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${got.join(" > ")}${ok ? "" : `   expected ${expect.join(" > ")}`}`);
  if (!ok) process.exitCode = 1;
}

run("E A = slash", [note("E", 0), note("A", 300)], false, ["luteStrike", "wolfBane"]);
run("E G A = fireball", [note("E", 0), note("G", 300), note("A", 600)], false, ["luteStrike", "luteStrike", "dragonsBreath"]);
run("A B D E = uppercut", [note("A", 0), note("B", 300), note("D", 600), note("E", 900)], false, ["luteStrike", "luteStrike", "luteStrike", "beanstalk"]);
run("E G A B D E, no magic = fireball then uppercut", [0, 1, 2, 3, 4, 5].map((i) => note("EGABDE"[i], i * 300)), false,
  ["luteStrike", "luteStrike", "dragonsBreath", "luteStrike", "luteStrike", "beanstalk"]);
run("E G A B D E, full magic = super", [0, 1, 2, 3, 4, 5].map((i) => note("EGABDE"[i], i * 300)), true,
  ["luteStrike", "luteStrike", "dragonsBreath", "luteStrike", "luteStrike", "happilyEverAfter"]);
run("gap > 700 ms breaks the combo", [note("E", 0), note("A", 900)], false, ["luteStrike", "luteStrike"]);
run("wrong note resets, then combo still works", [note("E", 0), note("C", 200), note("E", 400), note("A", 600)], false,
  ["luteStrike", "luteStrike", "luteStrike", "wolfBane"]);
run("Em chord = shield", [chord("Em", 0)], false, ["glassSlipper"]);
run("G C D chords = heal", [chord("G", 0), chord("C", 400), chord("D", 800)], false, ["luteStrike", "luteStrike", "godmother"]);
run("slash twice in a row", [note("E", 0), note("A", 200), note("E", 400), note("A", 600)], false, ["luteStrike", "wolfBane", "luteStrike", "wolfBane"]);
