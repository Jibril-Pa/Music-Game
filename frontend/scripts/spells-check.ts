/** Checks the chord-to-slay rules: npx tsx scripts/spells-check.ts */
import { SYMBOL_SETS, bestChord, chordMidis, enemyPool, fingeringFor, matches, randomSymbols, symbolCountFor, symbolForSongNote } from "@/lib/combat/spells";
import { chordAt, chordTrack, demoSong, minGapFor, planFight } from "@/lib/boss/songs";
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
check("notes mode shows the song's real note (C# stays C#)", symbolForSongNote("C#", "notes") === "C#");
check("every note has a place on the fretboard", ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].every((n) => (fingeringFor(n, "notes").notes ?? []).length > 0));
const OPEN = [40, 45, 50, 55, 59, 64];
check(
  "...and every place really is that note",
  ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].every((n, pc) => (fingeringFor(n, "notes").notes ?? []).every((sp) => (OPEN[6 - sp.string] + sp.fret) % 12 === pc)),
);
check("chord diagrams have finger numbers", ["Em", "G", "D", "C", "Am", "A", "E"].every((c) => (fingeringFor(c, "chords").fingers ?? "").length === 6));
check(
  "fingers match the shapes (open/x where no finger)",
  ["Em", "G", "D", "C", "Am", "A", "E"].every((c) => {
    const f = fingeringFor(c, "chords");
    return [...(f.shape ?? "")].every((fr, i) => (fr === "0" || fr === "x" ? f.fingers![i] === fr : /[1-4]/.test(f.fingers![i])));
  }),
);

// a song's harmony
const w = new Array(12).fill(0);
[0, 4, 7].forEach((pc) => (w[pc] = 1));
check("C E G fits a C chord", bestChord(w, 0).chord === "C");
const w2 = new Array(12).fill(0);
[9, 0, 4].forEach((pc) => (w2[pc] = 1));
check("A C E fits Am", bestChord(w2, 9).chord === "Am");
const prog: { t: number; dur: number; midi: number; velocity: number }[] = [];
const PROG: [number, number[]][] = [[0, [48, 52, 55]], [2, [43, 47, 50]], [4, [45, 48, 52]], [6, [41, 45, 48]]]; // C G Am F(->C/Am)
for (const [bar, midis] of PROG) for (let b = 0; b < 4; b++) for (const m of midis) prog.push({ t: bar * 2 + b * 0.5, dur: 0.45, midi: m + 12, velocity: 90 });
const grid = Array.from({ length: 32 }, (_, i) => i * 0.5);
const tr = chordTrack(prog, grid, 16);
check("chord track follows C -> G -> Am", chordAt(tr, 0.6) === "C" && chordAt(tr, 4.6) === "G" && chordAt(tr, 8.6) === "Am", `${chordAt(tr, 0.6)} ${chordAt(tr, 4.6)} ${chordAt(tr, 8.6)}`);
const fought = planFight(prog.map((n) => ({ t: n.t, pc: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n.midi % 12] })), grid, 120, 16, "chords", tr);
check("boss howls use the song's chord at that moment", fought.attacks.every((a) => a.symbol === chordAt(tr, a.t)), fought.attacks.map((a) => `${a.t}:${a.symbol}`).join(" "));
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
