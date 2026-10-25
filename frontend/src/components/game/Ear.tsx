"use client";

import { useEffect, useRef } from "react";
import type { HeardEntry } from "@/game/events";
import type { PlayMode } from "@/lib/combat/spells";
import { getNoteInput } from "@/lib/input/noteInput";
import { describe } from "@/lib/input/types";
import { Icon } from "./Icon";

/**
 * The line under the newest chip: the chord, then the shared `line` (the bard's bubble says the same),
 * never "perfect" for a miss. Compact frames hide the chord (.ear-cap-what): the chip above shows it.
 */
function Caption({ h }: { h: HeardEntry }) {
  const what = describe(h.ev);
  const line = h.line !== undefined ? h.line : h.hit ? "" : "missed";
  return (
    <div className="ear-caption">
      {line ? (
        <>
          <span className="ear-cap-what">{what} · </span>
          {line}
        </>
      ) : (
        what
      )}
    </div>
  );
}

/**
 * The "ear": the last four things the game heard, newest on the right, so
 * players (and judges) can see detection working. Bottom-right, out of the
 * bard's way.
 */
export function Ear({
  heard,
  micOn,
  micLost,
  playMode,
  latencyMs,
}: {
  heard: HeardEntry[];
  micOn: boolean;
  micLost: boolean;
  playMode: PlayMode;
  latencyMs: number | null;
}) {
  // Mic level, written straight to the DOM (~25 times a second, no React renders).
  const meterRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!micOn) return;
    return getNoteInput().onDiag((d) => {
      const el = meterRef.current;
      if (!el) return;
      const r = d.rms / Math.max(0.002, d.noiseFloor);
      el.dataset.level = String(r >= 6 ? 3 : r >= 3 ? 2 : r >= 1.5 ? 1 : 0);
    });
  }, [micOn]);

  const what = playMode === "chords" ? "chord" : "note";
  const empty = micOn ? (playMode === "chords" ? "Strum the chord over a foe" : "Pluck the note over a foe") : `Press the key under a foe’s ${what}`;
  const newest = heard.at(-1);
  return (
    <div className="hud-ear plate">
      <div className="ear-title">
        <Icon name={micOn ? "lute" : "keys"} />
        <span>Heard</span>
        {micOn && (
          <span ref={meterRef} className="ear-meter" data-level="0" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {micLost && <span className="ear-lost">mic lost</span>}
        {micOn && latencyMs !== null && (
          <span className="ear-lat num" title="Time from your strum to the game hearing it">
            ~{Math.round(latencyMs)} ms
          </span>
        )}
      </div>
      <div className="ear-row" role="log" aria-label="What the game heard" aria-live="off">
        {heard.length === 0 ? (
          <span className="ear-empty">{empty}</span>
        ) : (
          heard.map((h, i) => {
            // Nothing was there to hit: neither right nor wrong, so no cross and no dashed edge.
            const neutral = !h.hit && h.line === "";
            const mark = neutral ? "note" : !h.hit ? "cross" : h.grade === "perfect" ? "star" : "check";
            const verdict = neutral ? "nothing to hit" : h.hit ? (h.grade === "perfect" ? "perfect" : "hit") : "missed";
            const label = `${describe(h.ev)}: ${verdict}`;
            const kind = neutral ? "neutral" : h.hit ? "hit" : "miss";
            return (
              <div key={h.ev.id} className={`ear-chip ${kind}${i === heard.length - 1 ? " is-newest" : ""}`} title={label}>
                <b>{describe(h.ev)}</b>
                <Icon name={mark} />
              </div>
            );
          })
        )}
      </div>
      {newest && <Caption h={newest} />}
    </div>
  );
}
