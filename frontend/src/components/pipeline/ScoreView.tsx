"use client";

// Renders score.alphatex (tab + standard notation) with alphaTab.
// alphaTab is imported in the browser only; its music font is served from
// public/alphatab/font (copied by scripts/copy-alphatab.mjs), so no bundler
// plugin or internet connection is needed.

import { useEffect, useRef, useState } from "react";

interface Props {
  tex: string;
  trackIndex: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AlphaTabApi = any;

export default function ScoreView({ tex, trackIndex }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ tex, trackIndex });
  useEffect(() => {
    latest.current = { tex, trackIndex };
  });

  useEffect(() => {
    let disposed = false;
    import("@coderline/alphatab")
      .then((alphaTab) => {
        if (disposed || !elRef.current) return;
        const api = new alphaTab.AlphaTabApi(elRef.current, {
          core: { fontDirectory: "/alphatab/font/", useWorkers: false },
          player: { enablePlayer: false, scrollMode: alphaTab.ScrollMode.Off },
          display: { layoutMode: alphaTab.LayoutMode.Page, scale: 0.9 },
        });
        api.renderFinished.on(() => setStatus("ready"));
        api.error.on((e: unknown) => {
          setStatus("error");
          setError(e instanceof Error ? e.message : String(e));
        });
        apiRef.current = api;
        api.tex(latest.current.tex, [latest.current.trackIndex]);
      })
      .catch((e) => {
        setStatus("error");
        setError(String(e));
      });
    return () => {
      disposed = true;
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!apiRef.current) return;
    setStatus("loading");
    apiRef.current.tex(tex, [trackIndex]);
  }, [tex, trackIndex]);

  return (
    <div className="score-view">
      {status === "loading" && <div className="muted">Rendering score…</div>}
      {status === "error" && <div className="error">alphaTab couldn&apos;t render the score: {error}</div>}
      <div ref={elRef} className="score-surface" />
    </div>
  );
}
