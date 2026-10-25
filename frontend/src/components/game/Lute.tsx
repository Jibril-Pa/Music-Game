"use client";

/**
 * The lute's advice on the End screen: a card at the bottom-left (headline, the top tip, the drill),
 * and the Lute's Notebook (every tip, the drill's chord boxes, your progress from Tiger Data).
 * The advice is Gemini's when the backend could get it, else the game's built-in tips.
 */

import { useState } from "react";
import { SYMBOL_SETS, fingeringFor, type PlayMode } from "@/lib/combat/spells";
import type { CoachResult, History, RunSummary } from "@/lib/coach/types";
import Fretboard from "./Fretboard";
import { Icon } from "./Icon";
import Modal from "./Modal";

export type CoachState =
  | { status: "loading"; runId: string }
  | { status: "ready"; runId: string; result: CoachResult; summary: RunSummary };

type Ready = Extract<CoachState, { status: "ready" }>;

const pct = (hits: number, tries: number) => (tries ? Math.round((100 * hits) / tries) : 0);

function sourceLine(r: CoachResult): string {
  const who = r.source === "gemini" ? `Advice by Gemini${r.model ? ` (${r.model})` : ""}` : "The lute's built-in tips";
  return r.history ? `${who} · your history is kept in Tiger Data` : who;
}

export function LuteCard({ state, onNotes }: { state: CoachState; onNotes: () => void }) {
  const ready = state.status === "ready" ? state : null;
  const advice = ready?.result.advice;
  const tip = advice?.tips[0];
  return (
    <section className="lute-card plate" aria-labelledby="lute-h" aria-busy={!ready}>
      <Icon name="lute" size="2.2em" className="lute-icon" />
      <div className="lute-body" aria-live="polite">
        <p className="lute-kicker">Your lute says</p>
        <h3 id="lute-h">{advice ? advice.headline : "Hmm, let me think…"}</h3>
        {!advice ? (
          <p className="lute-wait">Going over every chord you played…</p>
        ) : (
          tip && (
            <p className="lute-tip">
              <b>{tip.title}.</b> {tip.body}
            </p>
          )
        )}
      </div>
      {advice && ready && (
        <div className="lute-foot">
          {advice.drill && (
            <p className="lute-drill">
              <span className="lute-label">Drill</span>
              {advice.drill.chords.map((c) => (
                <b key={c} className="lute-chip">
                  {c}
                </b>
              ))}
              <span className="num">×{advice.drill.reps}</span>
            </p>
          )}
          <button className="gm-btn lute-more" onClick={onNotes}>
            <Icon name="book" />
            <span>The lute&rsquo;s notebook</span>
          </button>
          <p className="lute-src">{sourceLine(ready.result)}</p>
        </div>
      )}
    </section>
  );
}

export function LuteNotes({ state, onClose }: { state: Ready; onClose: () => void }) {
  const { result, summary } = state;
  const { advice, history } = result;
  const mode = summary.mode;
  return (
    <Modal labelledBy="ln-h" initialFocus=".ln-close" className="ln-modal">
      <div className="gm-panel ln">
        <div className="ln-head">
          <h2 id="ln-h">
            <Icon name="lute" /> The Lute&rsquo;s Notebook
          </h2>
          <button className="gm-btn ln-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="ln-cols">
          <section className="ln-advice" aria-labelledby="ln-adv-h">
            <h3 id="ln-adv-h">{advice.headline}</h3>
            {advice.praise && <p className="ln-praise">{advice.praise}</p>}
            <ol className="ln-tips">
              {advice.tips.map((t) => (
                <li key={t.title}>
                  <b>{t.title}</b>
                  <span>{t.body}</span>
                </li>
              ))}
            </ol>
            {advice.drill && (
              <div className="ln-drill">
                <h4>
                  Drill: {advice.drill.chords.join(" → ")} <span className="num">×{advice.drill.reps}</span>
                </h4>
                <div className="ln-boxes">
                  {advice.drill.chords.map((c) => (
                    <div key={c} className="ln-box">
                      <span className="cb-pill">{c}</span>
                      <Fretboard fingering={fingeringFor(c, mode)} variant="book" />
                    </div>
                  ))}
                </div>
                {advice.drill.how && <p>{advice.drill.how}</p>}
              </div>
            )}
            {advice.goal && (
              <p className="ln-goal">
                <b>Next run:</b> {advice.goal}
              </p>
            )}
          </section>
          <section className="ln-progress" aria-labelledby="ln-prog-h">
            <h3 id="ln-prog-h">Your progress</h3>
            {history ? (
              <>
                <Totals history={history} mode={mode} />
                {history.runs.length >= 2 && <RunChart runs={history.runs} runId={state.runId} mode={mode} />}
              </>
            ) : (
              <p className="ln-empty">Your progress across runs shows here once the lute&rsquo;s notebook (Tiger Data) is connected.</p>
            )}
            <ChordRows summary={summary} history={history} runId={state.runId} />
            {history && <Community history={history} mode={mode} />}
          </section>
        </div>
        <p className="ln-src">{sourceLine(result)}</p>
      </div>
    </Modal>
  );
}

function Totals({ history, mode }: { history: History; mode: PlayMode }) {
  const t = history.totals;
  const tiles: [string, string][] = [
    [mode === "notes" ? "Notes played" : "Chords played", t.plays.toLocaleString()],
    ["Runs", String(t.runs)],
    ["Minutes", String(Math.round(t.minutes ?? 0))],
    ["Days", String(t.days)],
  ];
  return (
    <dl className="ln-kpis">
      {tiles.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Right inputs per run, oldest to newest: one series, so no legend (the caption names it). */
function RunChart({ runs, runId, mode }: { runs: History["runs"]; runId: string; mode: PlayMode }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 320;
  const H = 128;
  const L = 34;
  const R = 34;
  const T = 10;
  const B = 22;
  const n = runs.length;
  const band = (W - L - R) / Math.max(1, n - 1);
  const yOf = (p: number) => T + (1 - p / 100) * (H - T - B);
  const pts = runs.map((r, i) => {
    const p = pct(r.hits, r.tries);
    return { i, r, p, x: L + i * band, y: yOf(p) };
  });
  const last = pts[n - 1];
  const nowIsLast = runs[n - 1]?.runId === runId;
  const label = (i: number) => (i === n - 1 && nowIsLast ? "This run" : `Run ${i + 1}`);
  const a = active !== null ? pts[active] : null;
  const what = mode === "notes" ? "notes" : "chords";
  return (
    <figure className="ln-chart">
      <figcaption>
        Right {what} per run, your last {n}
      </figcaption>
      <div className="ln-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="ln-svg">
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line className="ln-grid" x1={L} x2={W - R} y1={yOf(v)} y2={yOf(v)} />
              <text className="ln-tick" x={L - 6} y={yOf(v)} dy="0.32em" textAnchor="end">
                {v}%
              </text>
            </g>
          ))}
          {a && <line className="ln-cross" x1={a.x} x2={a.x} y1={T} y2={H - B} />}
          <path className="ln-line" d={pts.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} />
          {pts.map((p) => (
            <circle key={p.i} className={`ln-dot${p.i === active ? " on" : ""}`} cx={p.x} cy={p.y} r={4} />
          ))}
          <text className="ln-end num" x={last.x + 9} y={last.y} dy="0.32em">
            {last.p}%
          </text>
          {pts.map((p) => (
            <text key={`x${p.i}`} className="ln-tick" x={p.x} y={H - 6} textAnchor="middle">
              {p.i === n - 1 && nowIsLast ? "now" : p.i + 1}
            </text>
          ))}
          {pts.map((p) => (
            <rect
              key={`h${p.i}`}
              className="ln-hit"
              x={p.x - band / 2}
              y={0}
              width={band}
              height={H - B}
              tabIndex={0}
              role="img"
              aria-label={`${label(p.i)}: ${p.p}% right, ${p.r.hits} of ${p.r.tries}`}
              onPointerEnter={() => setActive(p.i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(p.i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {a && (
          <div className="ln-tooltip" style={{ left: `${(a.x / W) * 100}%`, top: `${(a.y / H) * 100}%` }} aria-hidden="true">
            <b className="num">{a.p}%</b>
            <span>
              {label(a.i)} · {a.r.hits} of {a.r.tries}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Each chord: earlier runs (light dot) to this run (dark dot), values always printed beside it. */
function ChordRows({ summary, history, runId }: { summary: RunSummary; history: History | null; runId: string }) {
  const earlier = new Map<string, [number, number]>();
  for (const r of history?.runs ?? []) {
    if (r.runId === runId) continue;
    for (const [c, [h, t]] of Object.entries(r.chords)) {
      const e = earlier.get(c) ?? [0, 0];
      earlier.set(c, [e[0] + h, e[1] + t]);
    }
  }
  const set = SYMBOL_SETS[summary.mode];
  const order = [...set.enemy, set.heal, set.super];
  const rank = (c: string) => (order.indexOf(c) < 0 ? 99 : order.indexOf(c));
  const rows = summary.chords
    .filter((c) => c.tries > 0)
    .sort((a, b) => rank(a.chord) - rank(b.chord))
    .map((c) => {
      const b = earlier.get(c.chord);
      return { chord: c.chord, now: pct(c.hits, c.tries), hits: c.hits, tries: c.tries, before: b && b[1] >= 3 ? pct(b[0], b[1]) : null };
    });
  if (!rows.length) return null;
  const anyBefore = rows.some((r) => r.before !== null);
  const what = summary.mode === "notes" ? "note" : "chord";
  return (
    <figure className="ln-chords">
      <figcaption>{anyBefore ? `Each ${what}: earlier runs → this run` : `Each ${what} this run`}</figcaption>
      {anyBefore && (
        <ul className="ln-legend" aria-hidden="true">
          <li>
            <i className="k-before" /> Earlier runs
          </li>
          <li>
            <i className="k-now" /> This run
          </li>
        </ul>
      )}
      <table className="ln-table">
        <thead className="sr-only">
          <tr>
            <th scope="col">{what}</th>
            <th scope="col">Chart</th>
            <th scope="col">Right</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chord}>
              <th scope="row">{r.chord}</th>
              <td className="ln-track" aria-hidden="true">
                <svg width="100%" height="18">
                  <line className="ln-rail" x1="0%" x2="100%" y1="9" y2="9" />
                  {r.before !== null && <line className="ln-link" x1={`${r.before}%`} x2={`${r.now}%`} y1="9" y2="9" />}
                  {r.before !== null && <circle className="ln-before" cx={`${r.before}%`} cy="9" r="4.5" />}
                  <circle className="ln-now" cx={`${r.now}%`} cy="9" r="4.5" />
                </svg>
              </td>
              <td className="ln-vals num">
                {r.before !== null && <span className="muted">{r.before}% → </span>}
                <b>{r.now}%</b> <small className="muted">
                  ({r.hits} of {r.tries})
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Community({ history, mode }: { history: History; mode: PlayMode }) {
  const c = history.community;
  if (!c || c.bards < 1 || c.plays < 1) return null;
  const rated = Object.entries(c.chords).filter(([, [, t]]) => t >= 20);
  const hardest = rated.sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0];
  const what = mode === "notes" ? "notes" : "chords";
  return (
    <p className="ln-community">
      <b>Every bard, last 24 hours:</b> {c.bards} {c.bards === 1 ? "bard" : "bards"} played {c.plays.toLocaleString()} {what}.
      {hardest && (
        <>
          {" "}
          The trickiest: <b>{hardest[0]}</b> ({pct(hardest[1][0], hardest[1][1])}% right).
        </>
      )}
    </p>
  );
}
