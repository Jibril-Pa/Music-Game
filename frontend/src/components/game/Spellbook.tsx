"use client";

import { MOVES, inputLabel } from "@/lib/combat/combos";
import { COMBO_CONFIG } from "@/lib/combat/combos";
import { RHYTHM_CONFIG } from "@/lib/combat/rhythm";
import { keyFor } from "@/lib/input/noteInput";
import Fretboard from "./Fretboard";

interface Props {
  practice: boolean;
  onPractice: (on: boolean) => void;
  onClose: () => void;
}

/** Every move: notes, keyboard keys, and where to play them. */
export default function Spellbook({ practice, onPractice, onClose }: Props) {
  return (
    <div className="gm-modal" role="dialog" aria-label="Spellbook">
      <div className="gm-panel spellbook">
        <header className="sb-head">
          <h2>The Bard&apos;s Spellbook</h2>
          <button className="gm-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="sb-intro">
          Play notes in order, quickly (less than {COMBO_CONFIG.maxGapMs / 1000} s apart). Any note is already a jab; finish the pattern to cast the spell.
          Octave doesn&apos;t matter, and the red dot is the easiest place to play it (open strings!). Keyboard: Z X C V B = E G A B D, 1 2 3 4 = Em G C D.
          Notes on the beat score <b>Perfect</b> (×1.5 damage, more magic).
        </p>
        <label className="sb-practice">
          <input type="checkbox" checked={practice} onChange={(e) => onPractice(e.target.checked)} /> Practice mode: wider timing (combo gap{" "}
          {COMBO_CONFIG.practiceMaxGapMs / 1000} s, Perfect ±{RHYTHM_CONFIG.practicePerfectMs} ms, parry ±{RHYTHM_CONFIG.practiceParryMs} ms)
        </label>
        <div className="sb-grid">
          {MOVES.map((m) => (
            <section key={m.id} className={`sb-move ${m.kind}`}>
              <h3>{m.name}</h3>
              <div className="sb-inputs">
                {m.inputs ? (
                  m.inputs.map((inp, i) => (
                    <span key={i} className={`sb-pill ${inp.kind}`}>
                      {inputLabel(inp)}
                      {inp.kind === "chord" ? " chord" : ""}
                      <small>{keyFor(inputLabel(inp)) ? `key ${keyFor(inputLabel(inp))}` : ""}</small>
                    </span>
                  ))
                ) : (
                  <span className="sb-pill note">
                    any note<small>Z X C V B</small>
                  </span>
                )}
                {m.requiresFullMagic && <span className="sb-req">needs full magic</span>}
              </div>
              <p>{m.description}</p>
              <div className="sb-frets">
                {m.fingering.map((f, i) => (
                  <figure key={i}>
                    <Fretboard fingering={f} size={0.82} />
                    <figcaption>{f.label}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
