"use client";

import { SYMBOL_SETS, fingeringFor, symbolKind, type PlayMode } from "@/lib/combat/spells";
import { keyFor } from "@/lib/input/noteInput";
import { Legend } from "./ChordHelper";
import Fretboard from "./Fretboard";
import Modal from "./Modal";

interface Props {
  playMode: PlayMode;
  practice: boolean;
  onPractice: (on: boolean) => void;
  onClose: () => void;
}

function Card({ symbol, mode, title, text, accent }: { symbol: string; mode: PlayMode; title?: string; text?: string; accent?: string }) {
  const key = keyFor(symbol, symbolKind(mode));
  return (
    <section className={`cb-card${accent ? ` ${accent}` : ""}`}>
      <div className="cb-card-head">
        <span className="cb-pill">{symbol}</span>
        {key && <kbd title={`Keyboard: ${key}`}>{key}</kbd>}
        {title && <h4>{title}</h4>}
      </div>
      <Fretboard fingering={fingeringFor(symbol, mode)} variant="book" />
      {text && <p>{text}</p>}
    </section>
  );
}

/** When each foe symbol joins the game (in the order SYMBOL_SETS introduces them). */
function joins(i: number): string {
  return i < 2 ? "From the very start." : i === 2 ? "Joins early in 1-1." : "Joins halfway through 1-1.";
}

/** How to play + every chord (or note) the game asks for, as songbook chord boxes. */
export default function ChordBook({ playMode, practice, onPractice, onClose }: Props) {
  const set = SYMBOL_SETS[playMode];
  const chords = playMode === "chords";
  const what = chords ? "chord" : "note";
  return (
    <Modal labelledBy="cb-h" initialFocus=".cb-close" className="cb-modal">
      <div className="gm-panel cb">
        <div className="cb-head">
          <h2 id="cb-h">The Bard&rsquo;s {chords ? "Chord" : "Note"} Book</h2>
          <button className="gm-btn cb-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="cb-intro">
          The bard walks on their own. Every foe shows a {what} over its head: play it, and every foe showing that {what} is hit. Tougher foes show a few{" "}
          {what}s: play them in any order. Wrong {what}s just fizzle. {chords ? "Strum" : "Pluck"} right on the beat for <b>Perfect</b> (more magic):
          listen for the drum, or watch the gold frame close on the foe&rsquo;s {what}. {chords ? "No guitar? Each card shows its key." : "Open strings are all you need."}
        </p>
        <Legend mode={playMode} className="cb-legend" />
        <label className="sb-switch cb-practice">
          <input type="checkbox" role="switch" checked={practice} onChange={(e) => onPractice(e.target.checked)} />
          <span>Practice mode</span>
          <small>{chords ? "More time around the beat. A chord’s root note alone also counts (an E for Em)." : "More time around the beat."}</small>
        </label>
        <h3 className="cb-section">Foes ask for</h3>
        <div className="cb-grid">
          {set.enemy.map((s, i) => (
            <Card key={s} symbol={s} mode={playMode} text={joins(i)} />
          ))}
        </div>
        <h3 className="cb-section">Magic</h3>
        <div className="cb-grid">
          <Card symbol={set.heal} mode={playMode} title="Fairy godmother" text={`When the fairy appears, play ${set.heal} to heal 25%.`} accent="heal" />
          <Card
            symbol={set.super}
            mode={playMode}
            title="Happily Ever After"
            text={`With a full magic meter, play ${set.super}: every foe on screen vanishes.`}
            accent="super"
          />
        </div>
      </div>
    </Modal>
  );
}
