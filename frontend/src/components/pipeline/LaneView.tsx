"use client";

// Side-scrolling lane view of chart.json with a playhead synced to backing.mp3.
// guitar.wav plays alongside (toggleable) so you can hear whether the notes
// line up with the actual guitar. Click the lanes to seek.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart, Difficulty, Note } from "@/lib/pipeline";

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"]; // string 1..6
const STRING_COLORS = ["#ff5d73", "#ffb547", "#ffe156", "#5ee38f", "#4cc3ff", "#b78cff"];
const LANE_H = 42;
const TOP = 28;
const LEFT_GUTTER = 28;

interface Props {
  chart: Chart;
  difficulty: Difficulty;
  backingUrl: string;
  guitarUrl: string;
}

export default function LaneView({ chart, difficulty, backingUrl, guitarUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const backingRef = useRef<HTMLAudioElement>(null);
  const guitarRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTRef = useRef(0);

  const [pxPerSec, setPxPerSec] = useState(240);
  const [offsetMs, setOffsetMs] = useState(0);
  const [hearBacking, setHearBacking] = useState(true);
  const [hearGuitar, setHearGuitar] = useState(true);
  const [clicks, setClicks] = useState(false);
  const [rate, setRate] = useState(1);
  const [width, setWidth] = useState(900);

  const notes: Note[] = chart.difficulties[difficulty] ?? [];
  // Latest values for the animation loop (updated after each render).
  const settings = useRef({ pxPerSec, offsetMs, clicks });
  const notesRef = useRef(notes);
  useEffect(() => {
    settings.current = { pxPerSec, offsetMs, clicks };
    notesRef.current = notes;
  });

  // Resize canvas to container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (backingRef.current) backingRef.current.muted = !hearBacking;
    if (guitarRef.current) guitarRef.current.muted = !hearGuitar;
  }, [hearBacking, hearGuitar]);

  useEffect(() => {
    if (backingRef.current) backingRef.current.playbackRate = rate;
    if (guitarRef.current) guitarRef.current.playbackRate = rate;
  }, [rate]);

  // Keep the guitar stem locked to the backing track.
  useEffect(() => {
    const b = backingRef.current;
    const g = guitarRef.current;
    if (!b || !g) return;
    const sync = () => {
      g.currentTime = b.currentTime;
    };
    const onPlay = () => {
      sync();
      g.play().catch(() => {});
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    };
    const onPause = () => g.pause();
    b.addEventListener("play", onPlay);
    b.addEventListener("pause", onPause);
    b.addEventListener("seeked", sync);
    return () => {
      b.removeEventListener("play", onPlay);
      b.removeEventListener("pause", onPause);
      b.removeEventListener("seeked", sync);
    };
  }, [backingUrl, guitarUrl]);

  const click = useCallback((accent: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1800 : 1200;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }, []);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const height = TOP + LANE_H * 6 + 16;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const draw = () => {
      const { pxPerSec, offsetMs, clicks } = settings.current;
      const b = backingRef.current;
      const g = guitarRef.current;
      const audioT = b ? b.currentTime : 0;
      const t = audioT - offsetMs / 1000; // time shown under the playhead
      const playX = Math.round(width * 0.22);
      const x = (time: number) => playX + (time - t) * pxPerSec;
      const t0 = t - playX / pxPerSec;
      const t1 = t + (width - playX) / pxPerSec;

      if (b && g && !b.paused && Math.abs(g.currentTime - b.currentTime) > 0.05) g.currentTime = b.currentTime;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e1117";
      ctx.fillRect(0, 0, width, height);

      // beats + bar lines (beats[0] is the first downbeat)
      ctx.font = "11px ui-monospace, monospace";
      chart.beats.forEach((bt, i) => {
        if (bt < t0 - 1 || bt > t1 + 1) return;
        const bx = x(bt);
        const bar = i % 4 === 0;
        ctx.strokeStyle = bar ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.08)";
        ctx.lineWidth = bar ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(bx, TOP - 6);
        ctx.lineTo(bx, TOP + LANE_H * 6);
        ctx.stroke();
        if (bar) {
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.fillText(String(i / 4 + 1), bx + 3, TOP - 10);
        }
      });

      // strings
      for (let s = 0; s < 6; s++) {
        const y = TOP + LANE_H * s + LANE_H / 2;
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1 + s * 0.4;
        ctx.beginPath();
        ctx.moveTo(LEFT_GUTTER, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // notes
      const list = notesRef.current;
      ctx.font = "bold 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of list) {
        if (n.t + n.dur < t0 || n.t > t1) continue;
        const nx = x(n.t);
        const w = Math.max(24, n.dur * pxPerSec);
        const y = TOP + LANE_H * (n.string - 1) + 5;
        const h = LANE_H - 10;
        const hit = t >= n.t && t <= n.t + Math.max(0.08, n.dur);
        const color = STRING_COLORS[n.string - 1];
        ctx.globalAlpha = n.t + n.dur < t ? 0.35 : 1;
        ctx.fillStyle = color + "40";
        ctx.fillRect(nx, y, w, h);
        ctx.fillStyle = hit ? "#ffffff" : color;
        ctx.fillRect(nx, y, 5, h); // onset edge = exact note time
        ctx.beginPath();
        ctx.arc(nx, y + h / 2, h / 2 - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0e1117";
        ctx.fillText(String(n.fret), nx, y + h / 2 + 1);
        ctx.globalAlpha = 1;
      }

      // click track: notes that crossed the playhead since last frame
      const last = lastTRef.current;
      if (clicks && b && !b.paused && t > last && t - last < 0.25) {
        let accent = false;
        let any = false;
        for (const n of list) {
          if (n.t > last && n.t <= t) {
            any = true;
            accent ||= Number.isInteger(n.beat);
          }
        }
        if (any) click(accent);
      }
      lastTRef.current = t;

      // gutter + labels + playhead
      ctx.fillStyle = "#0e1117";
      ctx.fillRect(0, TOP - 2, LEFT_GUTTER, LANE_H * 6 + 4);
      ctx.textAlign = "center";
      ctx.font = "12px ui-monospace, monospace";
      STRING_LABELS.forEach((l, s) => {
        ctx.fillStyle = STRING_COLORS[s];
        ctx.fillText(l, LEFT_GUTTER / 2, TOP + LANE_H * s + LANE_H / 2);
      });
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, TOP - 18);
      ctx.lineTo(playX, TOP + LANE_H * 6 + 6);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(`${t.toFixed(2)}s`, playX + 6, TOP - 18);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, chart, click]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = backingRef.current;
    if (!b) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const playX = width * 0.22;
    const t = b.currentTime + (e.clientX - rect.left - playX) / pxPerSec;
    b.currentTime = Math.max(0, Math.min(chart.song.durationSec, t));
  };

  return (
    <div className="lane-view">
      <div ref={wrapRef} className="lane-canvas-wrap">
        <canvas ref={canvasRef} onClick={onCanvasClick} title="Click to seek" />
      </div>
      <audio ref={backingRef} src={backingUrl} controls preload="auto" className="lane-audio" />
      <audio ref={guitarRef} src={guitarUrl} preload="auto" />
      <div className="lane-controls">
        <label>
          <input type="checkbox" checked={hearBacking} onChange={(e) => setHearBacking(e.target.checked)} /> backing.mp3
        </label>
        <label>
          <input type="checkbox" checked={hearGuitar} onChange={(e) => setHearGuitar(e.target.checked)} /> guitar.wav
        </label>
        <label title="Plays a click as each note crosses the playhead">
          <input type="checkbox" checked={clicks} onChange={(e) => setClicks(e.target.checked)} /> click on notes
        </label>
        <label>
          speed{" "}
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
          </select>
        </label>
        <label>
          zoom <input type="range" min={80} max={600} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} />
        </label>
        <label title="Shift the notes if your speakers/Bluetooth add delay">
          offset {offsetMs} ms{" "}
          <input type="range" min={-200} max={200} step={5} value={offsetMs} onChange={(e) => setOffsetMs(Number(e.target.value))} />
        </label>
      </div>
    </div>
  );
}
