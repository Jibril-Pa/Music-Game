"use client";

import type { HeardEntry, HudState } from "@/game/events";
import { fingeringFor, symbolKind } from "@/lib/combat/spells";
import { keyFor } from "@/lib/input/noteInput";
import { describe } from "@/lib/input/types";
import Fretboard from "./Fretboard";

function Bar({ value, max, className, label }: { value: number; max: number; className: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`gm-bar ${className}`} aria-label={label}>
      <div className="gm-bar-fill" style={{ width: `${pct}%` }} />
      <span className="gm-bar-text">{label}</span>
    </div>
  );
}

export function Hud({ hud, beat }: { hud: HudState | null; beat: number }) {
  if (!hud) return null;
  const full = hud.magic >= 100;
  return (
    <>
      <div className="hud-tl">
        <Bar value={hud.heroHp} max={hud.heroMaxHp} className="hp" label={`Bard ${Math.ceil(hud.heroHp)}/${hud.heroMaxHp}`} />
        <Bar
          value={hud.magic}
          max={100}
          className={`magic ${full ? "full" : ""}`}
          label={full ? `Magic full! Play ${hud.superSymbol}` : `Magic ${Math.floor(hud.magic)}%`}
        />
        {hud.objective && <div className="hud-objective">{hud.objective}</div>}
      </div>
      {hud.boss ? (
        <div className="hud-top">
          <div className="hud-boss-name">{hud.boss.name}</div>
          <Bar value={hud.boss.hp} max={hud.boss.maxHp} className="boss" label={`${Math.ceil(hud.boss.hp)} / ${hud.boss.maxHp}`} />
        </div>
      ) : hud.enemy ? (
        <div className="hud-top small">
          <div className="hud-boss-name">{hud.enemy.name}</div>
          <Bar value={hud.enemy.hp} max={hud.enemy.maxHp} className="boss" label={`${hud.enemy.hp} chord${hud.enemy.hp === 1 ? "" : "s"} left`} />
        </div>
      ) : hud.progress !== undefined ? (
        <div className="hud-top small">
          <div className="hud-path">
            <div className="hud-path-fill" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
            <span className="hud-path-bard" style={{ left: `${Math.round(hud.progress * 100)}%` }}>
              🎸
            </span>
            <span className="hud-path-goal">{hud.goalIcon ?? "🐺"}</span>
          </div>
        </div>
      ) : null}
      <div className="hud-tr">
        <div key={`beat-${beat}`} className="hud-beat" title="the beat: play on it for Perfect" />
        {hud.combo >= 2 && (
          <div key={`combo-${hud.combo}`} className="hud-combo">
            {hud.combo}
            <span>in a row</span>
          </div>
        )}
      </div>
    </>
  );
}

/** The "ear": what the game heard, so players and judges can see detection. */
export function Ear({ heard, micOn }: { heard: HeardEntry[]; micOn: boolean }) {
  return (
    <div className="hud-ear">
      <div className="ear-title">{micOn ? "🎸 the ear hears" : "⌨ the ear hears"}</div>
      <div className="ear-row">
        {heard.length === 0 && <span className="ear-empty">play the chord over a foe…</span>}
        {heard.map((h, i) => (
          <div key={h.ev.id} className={`ear-chip ${h.grade ?? "none"} ${i === 0 ? "newest" : ""} ${h.hit ? "special" : "miss"}`}>
            <b>{describe(h.ev)}</b>
            <small>
              {h.ev.source === "mic" ? "🎸" : "⌨"} {h.grade && h.grade !== "off" ? h.grade : ""}
            </small>
            <em>{h.result}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLE_LABEL = { foe: "", heal: "heal", super: "super!" } as const;

/** Beginner helper: the shapes of the chords you need right now, at the bottom. */
export function ChordHelper({ hud, keyboard }: { hud: HudState | null; keyboard: boolean }) {
  const wanted = hud?.wanted ?? [];
  if (!hud || !wanted.length) return null;
  const mode = hud.playMode ?? "chords";
  return (
    <div className="chord-helper" aria-label="Chords to play">
      {wanted.map((w, i) => {
        const key = keyboard ? keyFor(w.symbol, symbolKind(mode)) : undefined;
        return (
          <div key={`${w.role}-${w.symbol}`} className={`ch-card ${w.role} ${i === 0 ? "first" : ""}`}>
            <div className="ch-name">
              {w.symbol}
              {ROLE_LABEL[w.role] && <em>{ROLE_LABEL[w.role]}</em>}
              {key && <small>key {key}</small>}
            </div>
            <Fretboard fingering={fingeringFor(w.symbol, mode)} size={i === 0 ? 0.78 : 0.62} />
          </div>
        );
      })}
    </div>
  );
}
