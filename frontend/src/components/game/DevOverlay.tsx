"use client";

import { useEffect, useState } from "react";
import { EventBus } from "@/game/EventBus";
import { EV } from "@/game/events";
import type { DetectorDiag } from "@/lib/input/detector";
import { getNoteInput, type LatencyStats, type MicStatus } from "@/lib/input/noteInput";

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v)} ms`);

/** Toggle with ` (backquote). FPS + measured mic latency. Subscribes itself, so the rest of the UI never re-renders for it. */
export default function DevOverlay({ mic }: { mic: MicStatus }) {
  const [fps, setFps] = useState(0);
  const [diag, setDiag] = useState<(DetectorDiag & { latency: LatencyStats }) | null>(null);
  useEffect(() => getNoteInput().onDiag(setDiag), []);
  useEffect(() => {
    const onFps = (f: number) => setFps(f);
    EventBus.on(EV.fps, onFps);
    return () => {
      EventBus.off(EV.fps, onFps);
    };
  }, []);
  const lat = diag?.latency ?? getNoteInput().latencyStats();
  return (
    <div className="dev-overlay">
      <div>
        <b className="num">{Math.round(fps)}</b> fps · mic <b>{mic}</b>
      </div>
      <div className="num">
        pluck→event last {fmt(lat.last)} · median {fmt(lat.median)} · p90 {fmt(lat.p90)}
      </div>
      <div className="num">
        + render ≤ 1 frame ({fps ? Math.round(1000 / fps) : 17} ms) · mic input {fmt(lat.input)}
      </div>
      <div className="num">
        level {diag ? diag.rms.toFixed(3) : "–"} · pitch {diag?.hz ? `${diag.hz.toFixed(0)} Hz (${diag.pitchConfidence.toFixed(2)})` : "–"} · {diag?.state ?? ""}
      </div>
      <div className="dev-dim">` to hide · /input-test for details</div>
    </div>
  );
}
