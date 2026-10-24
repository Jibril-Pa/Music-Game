"use client";

import type { ComboProgress, HeardEntry, HudState } from "@/game/events";
import { inputLabel } from "@/lib/combat/combos";
import { describe } from "@/lib/input/types";

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
        <Bar value={hud.magic} max={100} className={`magic ${full ? "full" : ""}`} label={full ? "SUPER ready: E G A B D E" : `Magic ${Math.floor(hud.magic)}%`} />
        {hud.shield && <div className="hud-shield">Glass Slipper Guard</div>}
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
          <Bar value={hud.enemy.hp} max={hud.enemy.maxHp} className="boss" label={`${Math.ceil(hud.enemy.hp)} / ${hud.enemy.maxHp}`} />
        </div>
      ) : null}
      <div className="hud-tr">
        <div key={`beat-${beat}`} className="hud-beat" title="the beat: play on it for Perfect" />
        {hud.combo >= 2 && (
          <div key={`combo-${hud.combo}`} className="hud-combo">
            {hud.combo}
            <span>hits</span>
          </div>
        )}
      </div>
    </>
  );
}

/** The "ear": what the game heard, so players and judges can see detection. */
export function Ear({ heard, progress, micOn }: { heard: HeardEntry[]; progress: ComboProgress; micOn: boolean }) {
  const next = progress.next[0];
  return (
    <div className="hud-ear">
      <div className="ear-title">{micOn ? "🎸 the ear hears" : "⌨ the ear hears"}</div>
      <div className="ear-row">
        {heard.length === 0 && <span className="ear-empty">play a note…</span>}
        {heard.map((h, i) => (
          <div key={h.ev.id} className={`ear-chip ${h.grade ?? "none"} ${i === 0 ? "newest" : ""} ${h.special ? "special" : ""}`}>
            <b>{describe(h.ev)}</b>
            <small>
              {h.ev.source === "mic" ? "🎸" : "⌨"} {h.grade && h.grade !== "off" ? h.grade : ""}
            </small>
            <em>{h.result}</em>
          </div>
        ))}
      </div>
      {next && progress.inputs.length > 0 && (
        <div className="ear-combo">
          {progress.inputs.map((e) => describe(e)).join(" → ")} → <b>{next.remaining.map(inputLabel).join(" → ")}</b> = {next.move.name}
          {progress.next.length > 1 && <span className="muted"> (or {progress.next.slice(1, 3).map((n) => n.move.name).join(", ")})</span>}
        </div>
      )}
    </div>
  );
}
