/** Checks the chord-to-slay rules: npx tsx scripts/spells-check.ts */
import { SYMBOL_SETS, chordMidis, enemyPool, matches, randomSymbols, symbolCountFor, symbolForSongNote } from "@/lib/combat/spells";
import { demoSong, minGapFor, planFight } from "@/lib/boss/songs";
import { BOSSES, LEVELS, type JourneyLevel } from "@/game/levels";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failed++;
}
const chord = (c: string) => ({ type: "chord" as const, pitchClass: "E" as const, chord: c as "Em" });
const note = (pc: string) => ({ type: "note" as const, pitchClass: pc as "E" });

// matching
check("Em chord slays an Em foe", matches(chord("Em"), "Em", "chords", false));
check("G chord doesn't slay an Em foe", !matches(chord("G"), "Em", "chords", false));
check("a single E note doesn't count as Em (normal)", !matches(note("E"), "Em", "chords", false));
check("...but does in practice mode (root note)", matches(note("E"), "Em", "chords", true));
check("notes mode: any-octave A slays an A foe", matches(note("A"), "A", "notes", false));
check("notes mode: a strummed chord counts as its root", matches({ type: "chord", pitchClass: "D", chord: "D" }, "D", "notes", false));

// symbol sets
const c = SYMBOL_SETS.chords;
check("enemy chords are all in E minor (fit the music)", c.enemy.every((s) => ["Em", "G", "D", "C", "Am"].includes(s)));
check("heal/super never appear on foes", !c.enemy.includes(c.heal) && !c.enemy.includes(c.super) && !SYMBOL_SETS.notes.enemy.includes(SYMBOL_SETS.notes.heal));
check("stage 0 uses only Em and G", JSON.stringify(enemyPool("chords", 0)) === JSON.stringify(["Em", "G"]));
check("stage 3 uses all five", enemyPool("chords", 3).length === 5);
check("chord voicing for G = 320003", JSON.stringify(chordMidis("G")) === JSON.stringify([43, 47, 50, 55, 59, 67]));

// tougher foes
let rnd = 0;
const seq = (vals: number[]) => () => vals[rnd++ % vals.length];
rnd = 0;
check("stage 0 foes always need 1", Array.from({ length: 50 }, () => symbolCountFor(1, 0)).every((n) => n === 1));
const counts = Array.from({ length: 4000 }, () => symbolCountFor(1, 3));
const share2 = counts.filter((n) => n === 2).length / counts.length;
const share3 = counts.filter((n) => n === 3).length / counts.length;
check("late foes: ~35% need 2 chords, ~12% need 3", Math.abs(share2 - 0.35) < 0.04 && Math.abs(share3 - 0.12) < 0.03, `got ${share2.toFixed(2)} / ${share3.toFixed(2)}`);
check("troll can need up to 5", symbolCountFor(3, 3, seq([0.01])) === 5);
const multi = randomSymbols("chords", 3, 3, seq([0.1, 0.1, 0.5]));
check("no chord twice in a row on one foe", multi.every((s, i) => i === 0 || s !== multi[i - 1]), multi.join(" "));

// boss howls
check("song note F# becomes a D chord", symbolForSongNote("F#", "chords") === "D");
check("song note B becomes Em", symbolForSongNote("B", "chords") === "Em");
check("song note C# becomes A in notes mode (nearest open string)", ["A", "D"].includes(symbolForSongNote("C#", "notes")));
const beats = Array.from({ length: 200 }, (_, i) => i * 0.5);
const dense = Array.from({ length: 300 }, (_, i) => ({ t: i * 0.25, pc: "E" }));
for (const mode of ["chords", "notes"] as const) {
  const { attacks } = planFight(dense, beats, 120, 100, mode);
  const gaps = attacks.slice(1).map((a, i) => a.t - attacks[i].t);
  check(`${mode}: howls at least ${minGapFor(mode, 120).toFixed(2)} s apart`, gaps.every((g) => g >= minGapFor(mode, 120) - 1e-6), `min gap ${Math.min(...gaps).toFixed(2)}`);
}
const demo = demoSong("chords");
check("demo song howls use foe chords", demo.attacks.length > 10 && demo.attacks.every((a) => c.enemy.includes(a.symbol)), `${demo.attacks.length} howls`);

// harder levels
const tough = Array.from({ length: 4000 }, () => symbolCountFor(1, 3, Math.random, 1.5));
const tough2 = tough.filter((n) => n === 2).length / tough.length;
const tough3 = tough.filter((n) => n === 3).length / tough.length;
check("toughness 1.5: more foes need 2-3 chords (~52% / ~18%)", Math.abs(tough2 - 0.525) < 0.04 && Math.abs(tough3 - 0.18) < 0.03, `got ${tough2.toFixed(2)} / ${tough3.toFixed(2)}`);
check("toughness never makes every foe tough (caps)", symbolCountFor(1, 3, () => 0.99, 10) === 1);

// the journey
check("9 levels: three worlds of walk, walk, boss", LEVELS.length === 9 && LEVELS.every((l, i) => l.kind === (i % 3 === 2 ? "boss" : "journey")));
check("worlds in order: forest, desert, future", LEVELS.map((l) => l.world).join(",") === "forest,forest,forest,desert,desert,desert,future,future,future");
const walks = LEVELS.filter((l): l is JourneyLevel => l.kind === "journey");
for (const k of ["walkSpeed", "foeSpeed", "foeDamage", "toughness", "bpm"] as const) {
  const v = walks.map((l) => l.difficulty[k]);
  check(`every walking level is harder: ${k} rises (${v.join(" → ")})`, v.every((x, i) => i === 0 || x > v[i - 1]));
}
const bosses = [BOSSES.forest, BOSSES.desert, BOSSES.future];
check("bosses get tougher: more HP", bosses.every((b, i) => i === 0 || b.hp > bosses[i - 1].hp));
check("bosses get tougher: howls show for less time", bosses.every((b, i) => i === 0 || b.leadMs < bosses[i - 1].leadMs));
check("bosses get tougher: faster songs", bosses.every((b, i) => i === 0 || b.demo.bpm > bosses[i - 1].demo.bpm));
for (const l of walks) {
  const pieces = l.spawns.filter((s) => ["troll-bridge", "witch-house", "beanstalk", "sesame-cave", "sphinx", "laser-gate", "nightingale"].includes(s.kind));
  check(`${l.id}: every set piece has its place`, pieces.every((p) => (l.landmarks as Record<string, number>)[p.kind] !== undefined && (l.landmarks as Record<string, number>)[p.kind] > p.at));
  check(`${l.id}: all foes come before the end`, l.spawns.every((s) => s.at < l.length - 300));
}

if (failed) process.exitCode = 1;
console.log(failed ? `${failed} failed` : "all passed");
