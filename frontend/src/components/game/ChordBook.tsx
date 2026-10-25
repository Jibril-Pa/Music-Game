"use client";

import { RHYTHM_CONFIG } from "@/lib/combat/rhythm";
import { SYMBOL_SETS, fingeringFor, symbolKind, type PlayMode } from "@/lib/combat/spells";
import { keyFor } from "@/lib/input/noteInput";
import Fretboard from "./Fretboard";

interface Props {
  playMode: PlayMode;
  practice: boolean;
  onPractice: (on: boolean) => void;
  onClose: () => void;
}

function Card({ symbol, mode, title, text, accent }: { symbol: string; mode: PlayMode; title?: string; text?: string; accent?: string }) {
  const key = keyFor(symbol, symbolKind(mode));
  return (
    <section className={`sb-move ${accent ?? ""}`}>
      <div className="cb-head">
        <span className="sb-pill">
          {symbol}
          <small>{key ? `key ${key}` : ""}</small>
        </span>
        {title && <h3>{title}</h3>}
      </div>
      {text && <p>{text}</p>}
      <Fretboard fingering={fingeringFor(symbol, mode)} size={0.95} />
    </section>
  );
}

/** How to play + every chord (or note) the game asks for, with diagrams. */
export default function ChordBook({ playMode, practice, onPractice, onClose }: Props) {
  const set = SYMBOL_SETS[playMode];
  const what = playMode === "chords" ? "chord" : "note";
  return (
    <div className="gm-modal" role="dialog" aria-label="Chord Book">
      <div className="gm-panel spellbook">
        <header className="sb-head">
          <h2>The Bard&apos;s {playMode === "chords" ? "Chord" : "Note"} Book</h2>
          <button className="gm-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="sb-intro">
          The bard walks on their own. Every foe shows a {what} over its head: play it and <b>every foe showing that {what}</b> is hit. Tougher foes need
          a few, in any order. Wrong {what}s just fizzle. Play on the beat for <b>Perfect</b> (more magic), and the music follows whatever you play.
          {playMode === "chords" ? " No guitar? Each card shows its key." : " Open strings are all you need."}
        </p>
        <label className="sb-practice">
          <input type="checkbox" checked={practice} onChange={(e) => onPractice(e.target.checked)} /> Practice mode: wider timing (Perfect ±
          {RHYTHM_CONFIG.practicePerfectMs} ms, howls ±320 ms){playMode === "chords" ? ", and the chord's root note alone also counts" : ""}
        </label>
        <h3 className="cb-section">Foes ask for</h3>
        <div className="sb-grid">
          {set.enemy.map((s, i) => (
            <Card key={s} symbol={s} mode={playMode} text={i < 2 ? "From the very start." : i === 2 ? "Joins after the first wolves." : "Shows up deeper in the forest."} />
          ))}
        </div>
        <h3 className="cb-section">Magic</h3>
        <div className="sb-grid">
          <Card symbol={set.heal} mode={playMode} title="Fairy godmother" text={`When the fairy appears, play ${set.heal} to heal 25%.`} accent="heal" />
          <Card symbol={set.super} mode={playMode} title="Happily Ever After" text={`With a full magic meter, play ${set.super}: every foe on screen vanishes.`} accent="super" />
        </div>
      </div>
    </div>
  );
}
