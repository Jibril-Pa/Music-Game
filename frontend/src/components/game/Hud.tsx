"use client";

import { useEffect, useState } from "react";
import type { HudState } from "@/game/events";
import { Icon, iconFor } from "./Icon";

/** A gauge: icon | bar | ink number. The bar is a meter for screen readers; fill and number are decoration. */
function Meter({ kind, label, value, max, valueText }: { kind: string; label: string; value: number; max: number; valueText: string }) {
  const top = Math.max(1, max);
  const v = Math.max(0, Math.min(top, value));
  return (
    <div
      className={`gm-bar ${kind}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={top}
      aria-valuenow={Math.round(v)}
      aria-valuetext={valueText}
    >
      <div className="gm-bar-fill" aria-hidden="true" style={{ transform: `scaleX(${v / top})` }} />
    </div>
  );
}

/**
 * The objective as a paper banner under the top-centre plate. Walking levels:
 * shown for 5 s whenever it changes. Boss: always (it is the phase instruction).
 * `text` is already paced by GameApp (each one holds at least 1.2 s, so rapid flips
 * never re-animate it); the parent remounts the HUD per scene, which resets the
 * last-seen objective.
 */
function Banner({ text, sticky }: { text?: string; sticky: boolean }) {
  const [seen, setSeen] = useState<string | undefined>(undefined);
  const [fresh, setFresh] = useState(false);
  if (text !== seen) {
    setSeen(text);
    setFresh(!!text);
  }
  useEffect(() => {
    if (!fresh || sticky) return;
    const t = window.setTimeout(() => setFresh(false), 5000);
    return () => window.clearTimeout(t);
  }, [fresh, sticky, seen]);
  if (!seen) return null;
  const shown = fresh || sticky;
  return (
    <div key={seen} className="hud-banner plate" data-shown={shown ? "1" : "0"} aria-hidden={shown ? undefined : true}>
      {seen}
    </div>
  );
}

const MILESTONES = new Set([5, 10, 20]);

export function Hud({ hud, objective, showPause, onPause }: { hud: HudState | null; objective?: string; showPause: boolean; onPause: () => void }) {
  if (!hud) return null;
  const full = hud.magic >= 100;
  const hp = Math.ceil(Math.max(0, hud.heroHp));
  const magic = Math.floor(Math.max(0, Math.min(100, hud.magic)));
  const what = hud.playMode === "notes" ? "note" : "chord";
  const progress = hud.progress !== undefined ? Math.max(0, Math.min(1, hud.progress)) : undefined;
  return (
    <>
      <div className="hud-tl plate">
        <div className="hud-stat hp">
          <Icon name="heart" />
          <Meter kind="hp" label="Bard’s health" value={hud.heroHp} max={hud.heroMaxHp} valueText={`${hp} of ${hud.heroMaxHp}`} />
          <span className="hud-num num" aria-hidden="true">
            {hp}
          </span>
        </div>
        <div className={`hud-stat magic${full ? " full" : ""}`}>
          <Icon name="star" />
          <Meter kind="magic" label="Magic" value={hud.magic} max={100} valueText={full ? `Magic full: play ${hud.superSymbol}` : `${magic}%`} />
          {full ? (
            <b className="hud-super" title={`Play ${hud.superSymbol} for Happily Ever After`} aria-hidden="true">
              {hud.superSymbol}
            </b>
          ) : (
            <span className="hud-num num" aria-hidden="true">
              {magic}%
            </span>
          )}
        </div>
      </div>

      <div className="hud-top">
        {hud.boss ? (
          <div className="hud-foe plate">
            <div className="hud-foe-name">{hud.boss.name}</div>
            <div className="hud-stat foe">
              <Meter
                kind="boss"
                label={hud.boss.name}
                value={hud.boss.hp}
                max={hud.boss.maxHp}
                valueText={`${Math.ceil(Math.max(0, hud.boss.hp))} of ${hud.boss.maxHp}`}
              />
              <span className="hud-num num" aria-hidden="true">
                {Math.ceil(Math.max(0, hud.boss.hp))}
              </span>
            </div>
          </div>
        ) : hud.enemy ? (
          <div className="hud-foe plate">
            <div className="hud-foe-name">{hud.enemy.name}</div>
            <div className="hud-stat foe">
              <Meter
                kind="boss"
                label={hud.enemy.name}
                value={hud.enemy.hp}
                max={hud.enemy.maxHp}
                valueText={`${hud.enemy.hp} ${what}${hud.enemy.hp === 1 ? "" : "s"} left`}
              />
              <span className="hud-num num" aria-hidden="true">
                {hud.enemy.hp} left
              </span>
            </div>
          </div>
        ) : progress !== undefined ? (
          <div className="hud-path" role="img" aria-label={`Level progress: ${Math.round(progress * 100)}%`}>
            <div className="hud-path-track">
              <div className="hud-path-fill" style={{ transform: `scaleX(${progress})` }} />
            </div>
            {/* A full-width track moved by transform: the bard advances without a layout per update. */}
            <span className="hud-path-bard" style={{ transform: `translateX(${progress * 100}%)` }}>
              <Icon name="bard" />
            </span>
            <span className="hud-path-goal">
              <Icon name={iconFor(hud.goalIcon)} />
            </span>
          </div>
        ) : null}
        <Banner text={objective} sticky={!!hud.boss} />
      </div>

      <div className="hud-tr">
        {hud.combo >= 2 && (
          <div key={`combo-${hud.combo}`} className={`hud-combo plate${MILESTONES.has(hud.combo) ? " milestone" : ""}`}>
            <b className="num">×{hud.combo}</b>
            <span>combo</span>
          </div>
        )}
        {showPause && (
          <button className="hud-pause" aria-label="Pause, Esc" aria-keyshortcuts="Escape" onClick={onPause}>
            <Icon name="pause" />
            <kbd className="hud-esc" aria-hidden="true">
              Esc
            </kbd>
          </button>
        )}
      </div>
    </>
  );
}
