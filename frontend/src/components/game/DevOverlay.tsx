"use client";

import { useEffect, useState } from "react";
import type { DetectorDiag } from "@/lib/input/detector";
import { getNoteInput, type LatencyStats, type MicStatus } from "@/lib/input/noteInput";

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v)} ms`);

/** Toggle with ` (backquote). FPS + measured mic latency. */
export default function DevOverlay({ fps, mic }: { fps: number; mic: MicStatus }) {
  const [diag, setDiag] = useState<(DetectorDiag & { latency: LatencyStats }) | null>(null);
  useEffect(() => getNoteInput().onDiag(setDiag), []);
  const lat = diag?.latency ?? getNoteInput().latencyStats();
  return (
    <div className="dev-overlay">
      <div>
        <b>{Math.round(fps)}</b> fps · mic <b>{mic}</b>
      </div>
      <div>
        pluck→event last {fmt(lat.last)} · median {fmt(lat.median)} · p90 {fmt(lat.p90)}
      </div>
      <div>
        + render ≤ 1 frame ({fps ? Math.round(1000 / fps) : 17} ms) · mic input {fmt(lat.input)}
      </div>
      <div>
        level {diag ? diag.rms.toFixed(3) : "–"} · pitch {diag?.hz ? `${diag.hz.toFixed(0)} Hz (${diag.pitchConfidence.toFixed(2)})` : "–"} · {diag?.state ?? ""}
      </div>
      <div className="muted">` to hide · /input-test for details</div>
    </div>
  );
}
