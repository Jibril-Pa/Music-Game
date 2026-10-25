"use client";

import { useEffect, useRef, useState } from "react";
import { EventBus } from "@/game/EventBus";
import { EV, type HudState } from "@/game/events";
import { fingeringFor, symbolKind, type Fingering, type PlayMode } from "@/lib/combat/spells";
import { keyFor } from "@/lib/input/noteInput";
import Fretboard from "./Fretboard";

type Wanted = NonNullable<HudState["wanted"]>[number];

/**
 * fingeringFor() builds a new object on every call, which would re-render the memoised
 * Fretboard on every HUD update (10 a second). Shapes never change, so each one is built once.
 */
const FINGERINGS = new Map<string, Fingering>();
function fingering(symbol: string, mode: PlayMode): Fingering {
  const key = `${mode}:${symbol}`;
  let f = FINGERINGS.get(key);
  if (!f) FINGERINGS.set(key, (f = fingeringFor(symbol, mode)));
  return f;
}

const ROLE_TAG: Record<Wanted["role"], string> = { foe: "", heal: "heal", super: "super!", howl: "next howl" };

/** The diagram's own marks, drawn inline so the legend matches the chord box exactly. */
function OpenMark() {
  return (
    <svg className="ch-mark" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle className="fb-open" cx="6" cy="6" r="4.2" strokeWidth="2" />
    </svg>
  );
}

function DotMark() {
  return (
    <svg className="ch-mark" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle className="fb-dot" cx="6" cy="6" r="4.6" strokeWidth="1.2" />
    </svg>
  );
}

/** How to read a chord box (the NOW card until 10 hits, and the Chord Book). */
export function Legend({ mode, className = "ch-legend" }: { mode: PlayMode; className?: string }) {
  if (mode === "notes")
    return (
      <p className={className}>
        <OpenMark /> pluck it open · <DotMark /> press here
      </p>
    );
  return (
    <p className={className}>
      <span>1 index · 2 middle</span>
      <span>3 ring · 4 pinky</span>
      <span>
        <OpenMark /> let it ring
      </span>
      <span>
        <span className="ch-x">×</span> don&rsquo;t play
      </span>
    </p>
  );
}

/**
 * The NOW card at the bard's feet (bottom-left, the one corner no foe walks
 * into): the chord to play next as a big chord box, then the next few as
 * small cards. A gold ring pulses on the beat (driven by a ref, no renders).
 * The parent remounts it on every scene, which clears the remembered chord.
 */
export function ChordHelper({ hud, keyboard, legend }: { hud: HudState | null; keyboard: boolean; legend: boolean }) {
  const wanted = hud?.wanted ?? [];
  const mode: PlayMode = hud?.playMode ?? "chords";
  const now = wanted[0] ?? null;
  // No flicker: between foes, keep the last chord on the card (dimmed).
  const [last, setLast] = useState<Wanted | null>(null);
  if (now && (now.symbol !== last?.symbol || now.role !== last?.role)) setLast(now);
  const shown = now ?? last;

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let flip = false;
    const onBeat = () => {
      const card = cardRef.current;
      if (!card) return;
      flip = !flip;
      card.dataset.beat = flip ? "a" : "b";
    };
    EventBus.on(EV.beat, onBeat);
    return () => {
      EventBus.off(EV.beat, onBeat);
    };
  }, []);

  if (!shown) return null;
  const kind = symbolKind(mode);
  const key = keyboard ? keyFor(shown.symbol, kind) : undefined;
  const shape = fingering(shown.symbol, mode);
  const spot = shape.notes?.[0];
  const tag = ROLE_TAG[shown.role];
  return (
    <div className="chord-helper">
      <div ref={cardRef} className={`ch-card now plate role-${shown.role}${now ? "" : " idle"}`}>
        {tag && <em className="ch-role">{tag}</em>}
        <div className="ch-head">
          <b className="ch-name">{shown.symbol}</b>
          {key && <kbd className="ch-key">{key}</kbd>}
        </div>
        <Fretboard fingering={shape} variant="now" />
        {mode === "notes" && spot && <span className="ch-caption">{spot.fret === 0 ? "open string" : `fret ${spot.fret}`}</span>}
        {legend && !keyboard && <Legend mode={mode} />}
      </div>
      {wanted.slice(1, 4).map((w) => (
        <div key={`${w.role}-${w.symbol}`} className={`ch-card next plate role-${w.role}`}>
          <b className="ch-name">{w.symbol}</b>
          <Fretboard fingering={fingering(w.symbol, mode)} variant="mini" />
        </div>
      ))}
    </div>
  );
}
