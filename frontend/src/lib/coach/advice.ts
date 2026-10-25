/**
 * The lute's built-in tips: what the end screen shows when Gemini can't answer (no key, no wifi,
 * too slow). Plain rules over the same numbers Gemini gets, so it's never empty and never wrong
 * about the shapes: a mix-up is explained by comparing the two chord boxes string by string.
 */

import { CHORD_FINGERS, CHORD_SHAPES, fingeringFor, type PlayMode } from "@/lib/combat/spells";
import { NOTE_SUFFIX } from "./summary";
import type { Advice, ChordStat, History, RunSummary } from "./types";

const STRING_WORDS = ["low E", "A", "D", "G", "B", "high e"];
const FINGER_WORDS: Record<string, string> = { "1": "index", "2": "middle", "3": "ring", "4": "pinky" };

const pct = (hits: number, tries: number) => (tries ? Math.round((100 * hits) / tries) : 0);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What the fretting hand must change to turn the chord the ear heard into the one wanted:
 * C from Am = "press the A string at fret 3 with your ring finger, and let the G string ring open".
 */
export function shapeFix(wanted: string, heard: string): string | null {
  const w = CHORD_SHAPES[wanted];
  const h = CHORD_SHAPES[heard];
  const fingers = CHORD_FINGERS[wanted];
  if (!w || !h || !fingers) return null;
  const pressed: string[] = [];
  const other: string[] = [];
  for (let i = 0; i < 6; i++) {
    if (w[i] === h[i]) continue;
    const string = STRING_WORDS[i];
    if (w[i] === "x") other.push(`don't strum the ${string} string`);
    else if (w[i] === "0") other.push(`let the ${string} string ring open`);
    else pressed.push(`press the ${string} string at fret ${w[i]} with your ${FINGER_WORDS[fingers[i]] ?? "fretting"} finger`);
  }
  const fixes = [...pressed, ...other].slice(0, 2);
  return fixes.length ? fixes.join(", and ") : null;
}

/** Where a single note lives: "the A string, played open". */
function noteSpot(note: string): string | null {
  const spot = fingeringFor(note, "notes").notes?.[0];
  if (!spot) return null;
  const string = STRING_WORDS[6 - spot.string];
  return spot.fret === 0 ? `the ${string} string, played open` : `the ${string} string at fret ${spot.fret}`;
}

function topMixup(c: ChordStat): [string, number] | null {
  const [heard, n] = Object.entries(c.heardAs).sort((a, b) => b[1] - a[1])[0] ?? [];
  return heard && n >= 2 ? [heard, n] : null;
}

function mixupTip(c: ChordStat, heard: string, n: number, mode: PlayMode): Advice["tips"][number] {
  const times = n === 1 ? "Once" : n === 2 ? "Twice" : `${n} times`;
  if (heard.endsWith(NOTE_SUFFIX)) {
    return {
      title: "Strum every string",
      body: `${times} your ${c.chord} came out as a single note. Keep your fingers down and strum through all the strings the chord box shows.`,
    };
  }
  if (mode === "chords") {
    const fix = shapeFix(c.chord, heard);
    return {
      title: `${c.chord}, not ${heard}`,
      body: `${times} your ${c.chord} sounded like ${heard} to me. ${fix ? `${cap(fix)}.` : "Check the chord box and press each finger just behind its fret."}`,
    };
  }
  const spot = noteSpot(c.chord);
  return { title: `${c.chord}, not ${heard}`, body: `${times} I heard ${heard} when ${c.chord} was wanted.${spot ? ` ${c.chord} is ${spot}.` : ""}` };
}

/** A chord that got clearly better across the last runs in Tiger Data (first run vs this one). */
function improvement(h: History | null): { chord: string; from: number; to: number; runs: number } | null {
  const runs = h?.runs ?? [];
  if (runs.length < 2) return null;
  let best: { chord: string; from: number; to: number; runs: number } | null = null;
  const last = runs[runs.length - 1].chords;
  for (const [chord, [hits, tries]] of Object.entries(last)) {
    if (tries < 3) continue;
    const first = runs.find((r) => (r.chords[chord]?.[1] ?? 0) >= 3);
    if (!first || first === runs[runs.length - 1]) continue;
    const [fh, ft] = first.chords[chord];
    const from = pct(fh, ft);
    const to = pct(hits, tries);
    if (to - from >= 15 && (!best || to - from > best.to - best.from)) best = { chord, from, to, runs: runs.length - runs.indexOf(first) };
  }
  return best;
}

export function localAdvice(s: RunSummary, h: History | null): Advice {
  const mode = s.mode;
  const what = mode === "notes" ? "notes" : "chords";
  const keyboard = s.input === "keyboard";
  const rated = s.chords.filter((c) => c.tries >= 3);
  // Weakest: lowest accuracy, the most tries first. Strongest: highest accuracy, the most tries first.
  const byAcc = [...rated].sort((a, b) => a.hits / a.tries - b.hits / b.tries || b.tries - a.tries);
  const weakest = byAcc[0] ?? s.chords[0] ?? null;
  const strongest = byAcc.length > 1 ? [...rated].sort((a, b) => b.hits / b.tries - a.hits / a.tries || b.tries - a.tries)[0] : null;
  const change = s.changes.find((c) => c.changes >= 3 && c.firstTry / c.changes < 0.6) ?? null;
  const accuracy = pct(s.hits, s.tries);

  const tips: Advice["tips"] = [];
  if (keyboard) {
    tips.push({ title: "Now try it on your guitar", body: `You played with the keys this time. Pick up your guitar and play the same ${what}: I'll be listening.` });
  } else if (weakest) {
    const mix = topMixup(weakest);
    if (mix) tips.push(mixupTip(weakest, mix[0], mix[1], mode));
  }
  if (change) {
    tips.push({
      title: `${change.from} to ${change.to}`,
      body: `Right after ${change.from}, your first ${change.to} landed ${change.firstTry} of ${change.changes} times. Lift all your fingers together and land them on the new shape at once, then strum.`,
    });
  }
  const t = s.timing;
  if (tips.length < 2 && t && t.n >= 6 && t.meanMs !== null && Math.abs(t.meanMs) > 40) {
    tips.push(
      t.meanMs < 0
        ? { title: "Wait for the beat", body: `You strum about ${-t.meanMs} ms before the beat. Tap your foot with the music and strum on the tap.` }
        : { title: "Strum on the beat", body: `You strum about ${t.meanMs} ms after the beat. Get the shape ready early, then strum right on it.` },
    );
  }
  if (!tips.length && weakest && weakest.hits < weakest.tries) {
    tips.push({
      title: `Polish your ${weakest.chord}`,
      body: `${weakest.chord} landed ${weakest.hits} of ${weakest.tries} times. Strum it slowly a few times before the next run and listen: every string should ring.`,
    });
  }
  if (!tips.length) tips.push({ title: "Play on the beat", body: "Strum right on the beat for Perfects: they fill your magic faster." });

  const up = improvement(h);
  const praise = up
    ? `Your ${up.chord} went from ${up.from}% to ${up.to}% over your last ${up.runs} runs!`
    : strongest && strongest.hits > 0
      ? `Your ${strongest.chord} landed ${strongest.hits} of ${strongest.tries} times.`
      : s.tries
        ? `You got ${s.hits} of ${s.tries} ${what} right.`
        : "Every journey starts with a single strum.";

  // A drill only for something that needs work (a flawless run gets a goal instead).
  const drillOf = change ? [change.from, change.to] : weakest && weakest.hits < weakest.tries ? [weakest.chord] : [];
  const drill = drillOf.length
    ? {
        chords: drillOf,
        reps: 8,
        how:
          drillOf.length > 1
            ? `Switch ${drillOf[0]}, ${drillOf[1]}, ${drillOf[0]}, ${drillOf[1]}, slowly and off the clock, until your fingers move together.`
            : `Strum ${drillOf[0]} slowly, take your hand off the neck, and place it again.`,
      }
    : null;

  const weakAcc = weakest ? weakest.hits / weakest.tries : 1;
  const goal =
    weakest && weakAcc < 0.8
      ? `Land ${weakest.chord} 8 times out of 10.`
      : s.maxCombo > 0
        ? `Beat your best combo of ${s.maxCombo}.`
        : `Play every ${mode === "notes" ? "note" : "chord"} on the beat.`;

  const focus = change ? `${change.from} to ${change.to}` : (weakest && weakest.hits < weakest.tries ? weakest.chord : "");
  // The canvas already says "Every bard misses a note sometimes": the lute talks about what to fix.
  const headline = s.victory
    ? accuracy >= 85
      ? "A performance for the ages!"
      : "Well played, bard!"
    : focus
      ? `So close! Let's fix your ${focus}.`
      : "Shake it off and play again!";

  return {
    headline,
    praise,
    focus,
    tips: tips.slice(0, 2),
    drill,
    goal,
  };
}
