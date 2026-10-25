"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DetectorDiag } from "@/lib/input/detector";
import { KEY_CHORDS, KEY_NOTES, getNoteInput, disposeNoteInput, type EchoStats, type LatencyStats, type MicStatus } from "@/lib/input/noteInput";
import { buildSelfTest, scoreSelfTest, type GroupResult } from "@/lib/input/selfTest";
import { PITCH_CLASSES, type NoteEvent } from "@/lib/input/types";
import { nearestNote } from "@/lib/audio/pitch";

type Diag = DetectorDiag & { latency: LatencyStats; echo: EchoStats };

function fmtMs(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : `${Math.round(v)} ms`;
}

/** The learned background level, with what it means for playing. */
function fmtNoise(v: number | null | undefined) {
  if (v === null || v === undefined) return "–";
  return `${v.toFixed(3)} ${v < 0.002 ? "(quiet)" : v < 0.004 ? "(fine)" : "(noisy: soft notes may be missed)"}`;
}

export default function InputTest() {
  const [status, setStatus] = useState<MicStatus>("off");
  const [error, setError] = useState<string | undefined>();
  const [events, setEvents] = useState<NoteEvent[]>([]);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [selfTest, setSelfTest] = useState<{ running: boolean; secondsLeft?: number; groups?: GroupResult[]; extra?: number } | null>(null);
  const [reaction, setReaction] = useState<number | null>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = getNoteInput();
    input.attachKeyboard();
    const offNote = input.on((e) => {
      setEvents((prev) => [e, ...prev].slice(0, 40));
      // Pluck -> on-screen: measure when this frame actually paints.
      requestAnimationFrame(() => {
        const painted = performance.now();
        setReaction(painted - e.time);
        const el = flashRef.current;
        if (el) {
          el.animate([{ background: "#ffcf5c" }, { background: "transparent" }], { duration: 300 });
        }
      });
    });
    const offDiag = input.onDiag((d) => setDiag(d));
    const offStatus = input.onStatus((s, err) => {
      setStatus(s);
      setError(err);
    });
    return () => {
      offNote();
      offDiag();
      offStatus();
      void disposeNoteInput(); // releases the mic when leaving the page
    };
  }, []);

  const startMic = () => getNoteInput().startMic().catch(() => {});
  const stopMic = () => getNoteInput().stopMic();

  const runSelfTest = async () => {
    const input = getNoteInput();
    const collected: NoteEvent[] = [];
    let startCtx = 0;
    let built: ReturnType<typeof buildSelfTest> | null = null;
    setSelfTest({ running: true });
    const off = input.on((e) => collected.push(e));
    await new Promise<void>((resolve, reject) => {
      input
        .startMic({
          kind: "buffer",
          loop: false,
          monitor: true,
          createBuffer: (ctx) => {
            built = buildSelfTest(ctx.sampleRate);
            const b = ctx.createBuffer(1, built.samples.length, ctx.sampleRate);
            b.copyToChannel(built.samples, 0);
            return b;
          },
          onStart: (t) => (startCtx = t),
          onFinish: () => resolve(),
        })
        .catch(reject);
      const tick = setInterval(() => {
        if (!built) return;
        const left = Math.max(0, Math.ceil(built.seconds - (performance.now() - (input.contextTimeToPerf(startCtx) ?? 0)) / 1000));
        setSelfTest((s) => (s?.running ? { ...s, secondsLeft: left } : s));
      }, 500);
      setTimeout(() => clearInterval(tick), 120000);
    }).catch(() => {});
    const startPerf = input.contextTimeToPerf(startCtx) ?? 0;
    await new Promise((r) => setTimeout(r, 300));
    off();
    await input.stopMic();
    if (!built) return setSelfTest(null);
    const result = scoreSelfTest((built as ReturnType<typeof buildSelfTest>).items, startPerf, collected.filter((e) => e.source === "mic"));
    setSelfTest({ running: false, groups: result.groups, extra: result.extra.length });
    (window as unknown as { __selfTest?: unknown }).__selfTest = result;
  };

  const last = events[0];
  const note = diag?.hz ? nearestNote(diag.hz) : null;
  const micEvents = events.filter((e) => e.source === "mic");

  return (
    <main className="page input-test">
      <header className="page-header">
        <h1>Note input test</h1>
        <p className="muted small">
          What the game hears. Keyboard is always on: {Object.values(KEY_NOTES).map((k) => `${k.label}=${k.pc}`).join("  ")} ·{" "}
          {Object.values(KEY_CHORDS).map((k) => `${k.label}=${k.chord}`).join("  ")} · <Link href="/play">play the game</Link>
        </p>
      </header>

      <section className="card it-controls">
        {status === "on" ? (
          <button onClick={stopMic}>Stop mic</button>
        ) : (
          <button type="submit" onClick={startMic} disabled={status === "starting" || !!selfTest?.running}>
            {status === "starting" ? "Starting…" : "Start mic"}
          </button>
        )}
        <button onClick={runSelfTest} disabled={!!selfTest?.running || status === "on"}>
          {selfTest?.running ? `Self-test running… ${selfTest.secondsLeft ?? ""}s` : "Run self-test (synthetic guitar)"}
        </button>
        <span className="muted small">
          mic: <b>{status}</b> {error && <span className="error">{error}</span>} · the browser&apos;s echo cancellation, noise suppression and auto-gain
          are off (they&apos;re made for voices and dull a guitar) · the game filters voices, clicks and its own music itself
        </span>
      </section>

      <section className="card it-grid">
        <div ref={flashRef} className="it-last">
          <div className="muted small">last heard</div>
          <div className="it-big">{last ? (last.type === "chord" ? last.chord : last.pitchClass) : "–"}</div>
          <div className="muted small">
            {last ? `${last.type} · ${last.source} · conf ${last.confidence.toFixed(2)}` : "play something"}
          </div>
        </div>
        <div>
          <div className="muted small">live pitch</div>
          <div className="it-mid">
            {note ? `${note.label}` : "–"} <span className="muted small">{diag?.hz ? `${diag.hz.toFixed(1)} Hz · conf ${diag.pitchConfidence.toFixed(2)}` : ""}</span>
          </div>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.min(100, (diag?.rms ?? 0) * 800)}%` }} />
          </div>
          <div className="muted small">
            state: {diag?.state ?? "–"} · chord guess: {diag?.bestChord ? `${diag.bestChord.name} ${diag.bestChord.score.toFixed(2)}` : "–"}
            {diag?.secondChord ? ` (next ${diag.secondChord.name} ${diag.secondChord.score.toFixed(2)})` : ""}
          </div>
          <div className="chroma">
            {PITCH_CLASSES.map((pc, i) => (
              <div key={pc} className="chroma-col">
                <div className="chroma-bar" style={{ height: `${Math.round((diag?.chroma?.[i] ?? 0) * 100)}%` }} />
                <span>{pc}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="muted small">latency (mic)</div>
          <table className="it-lat">
            <tbody>
              <tr><td>pluck → event, last</td><td>{fmtMs(diag?.latency.last)}</td></tr>
              <tr><td>median / p90</td><td>{fmtMs(diag?.latency.median)} / {fmtMs(diag?.latency.p90)}</td></tr>
              <tr><td>mic input latency (reported)</td><td>{fmtMs(diag?.latency.input)}</td></tr>
              <tr><td>onset → screen (last event)</td><td>{fmtMs(reaction)}</td></tr>
              <tr><td>events heard</td><td>{micEvents.length} mic · {events.length - micEvents.length} keys</td></tr>
            </tbody>
          </table>
          <p className="muted small">Target: under 100 ms from pluck to on-screen reaction.</p>
          <div className="muted small">listening only to your guitar</div>
          <table className="it-lat">
            <tbody>
              <tr><td>background noise</td><td>{fmtNoise(diag?.noiseFloor)}</td></tr>
              <tr><td>ignored: not a guitar (voices, clicks…)</td><td>{diag?.ignored ?? "–"}</td></tr>
              <tr><td>game sound reaching the mic</td><td>{diag?.echo.coupling == null ? "– (measured in the game)" : `${Math.round(diag.echo.coupling * 100)}%`}</td></tr>
              <tr><td>ignored: the game&apos;s own sound</td><td>{diag?.echo.echoes ?? "–"}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {selfTest?.groups && (
        <section className="card">
          <h3>Self-test results</h3>
          <table className="it-results">
            <thead>
              <tr><th>group</th><th>detected</th><th>median latency</th><th>onset error</th><th>misses</th></tr>
            </thead>
            <tbody>
              {selfTest.groups.map((g) => (
                <tr key={g.group} className={g.hits / g.total >= 0.8 ? "ok" : "bad"}>
                  <td>{g.group}</td>
                  <td>{g.hits}/{g.total}</td>
                  <td>{fmtMs(g.latencyMedian)}</td>
                  <td>{fmtMs(g.onsetErrorMedian)}</td>
                  <td className="small">{g.wrong.join(", ") || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{selfTest.extra} extra (unexpected) events.</p>
        </section>
      )}

      <section className="card">
        <h3>Events</h3>
        <table className="it-events">
          <thead>
            <tr><th>#</th><th>heard</th><th>type</th><th>source</th><th>conf</th><th>latency</th><th>midi</th></tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td><b>{e.type === "chord" ? e.chord : e.pitchClass}</b></td>
                <td>{e.type}</td>
                <td>{e.source}</td>
                <td>{e.confidence.toFixed(2)}</td>
                <td>{fmtMs(e.latencyMs)}</td>
                <td>{e.midi ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
