/**
 * The lute's memory. Every input the game judges is kept for this run (the End screen's coach reads
 * it) and sent to the backend in small batches, which stores them in Tiger Data.
 *
 * A run starts with the first level played after the title or an End screen, and ends at the End
 * screen (or when you quit to the title). Nothing here may slow the game: posts are text/plain (a
 * "simple" request, so no CORS preflight), never awaited by the game, and dropped when the backend
 * is down. NEXT_PUBLIC_COACH=off, or no backend for this page (see HAS_BACKEND), keeps everything in the
 * browser (built-in tips only).
 */

import type { GameOverInfo, GameStats, HeardEntry } from "@/game/events";
import { levelAt } from "@/game/levels";
import { session } from "@/game/state";
import { playedLabel } from "@/lib/combat/spells";
import { API_BASE, HAS_BACKEND } from "@/lib/pipeline";
import { localAdvice } from "./advice";
import { NOTE_SUFFIX, guessTarget, summarizeRun } from "./summary";
import type { CoachResult, History, PlayRecord, RunSummary } from "./types";

/** Send plays and ask Gemini only where there's a backend (not the public site without one). */
const ONLINE = process.env.NEXT_PUBLIC_COACH !== "off" && HAS_BACKEND;
const PLAYER_KEY = "traveling-bard:player";
/** Batches go out this often during play... */
const FLUSH_MS = 5000;
/** ...at most this many plays per request. */
const MAX_BATCH = 500;
/** After a failed request, stay quiet this long (no wifi: don't keep trying every few seconds). */
const QUIET_MS = 15000;
/** Gemini gets 15 s on the backend, plus the Tiger Data reads. */
const COACH_TIMEOUT_MS = 25000;
const MAX_RUN_PLAYS = 5000;

interface Run {
  id: string;
  startedAt: number;
  levels: string[];
  plays: PlayRecord[];
  /** Each level's stats object (a new one per level), for foes slain and the best combo. */
  stats: GameStats[];
}

let run: Run | null = null;
let queue: PlayRecord[] = [];
let queueRunId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let quietUntil = 0;
let player: string | null = null;
let pagehideHooked = false;

/** Random ids that work over plain http too (crypto.randomUUID needs a secure context). */
function randomId(prefix: string): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** An anonymous id for this browser, kept so your history follows you from run to run. */
export function playerId(): string {
  if (player) return player;
  try {
    player = localStorage.getItem(PLAYER_KEY);
  } catch {
    player = null;
  }
  if (!player || !/^[A-Za-z0-9_-]{6,64}$/.test(player)) {
    player = randomId("p");
    try {
      localStorage.setItem(PLAYER_KEY, player);
    } catch {
      // Storage blocked: a new bard every page load.
    }
  }
  return player;
}

async function post(path: string, body: unknown, opts: { keepalive?: boolean; timeoutMs?: number } = {}): Promise<Response | null> {
  if (!ONLINE || (!opts.keepalive && Date.now() < quietUntil)) return null;
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
      keepalive: opts.keepalive,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    return r.ok ? r : null;
  } catch {
    quietUntil = Date.now() + QUIET_MS;
    return null;
  }
}

/** Post one run's plays in batches; the last batch carries the run's summary (for the `runs` table), if any. */
async function sendPlays(runId: string, plays: PlayRecord[], final?: RunSummary, keepalive = false): Promise<void> {
  for (let i = 0; i < plays.length || (i === 0 && final); i += MAX_BATCH) {
    const last = i + MAX_BATCH >= plays.length;
    await post("/plays", { playerId: playerId(), runId, plays: plays.slice(i, i + MAX_BATCH), run: last ? final : undefined }, { keepalive });
  }
}

/** Send what's queued. The whole queue is taken now: plays recorded meanwhile go in the next flush. */
function flush(keepalive = false): Promise<void> {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  const runId = queueRunId;
  const plays = queue;
  queue = [];
  return runId && plays.length ? sendPlays(runId, plays, undefined, keepalive) : Promise.resolve();
}

function hookPagehide() {
  if (pagehideHooked || typeof window === "undefined") return;
  pagehideHooked = true;
  // Leaving the page mid-level: the last few seconds still reach Tiger Data.
  window.addEventListener("pagehide", () => void flush(true));
}

/** A fight scene started: the run goes on (or a new one starts). */
export function beginLevel(): void {
  const lv = levelAt(session.level);
  if (!run) run = { id: randomId("r"), startedAt: Date.now(), levels: [], plays: [], stats: [] };
  if (!run.levels.includes(lv.id)) run.levels.push(lv.id);
  hookPagehide();
}

/** Every input the fight judged (the EV.heard entry). */
export function recordPlay(h: HeardEntry, scene: string): void {
  if (!run) beginLevel();
  const r = run!;
  const lv = levelAt(session.level);
  const mode = session.playMode;
  const ev = h.ev;
  // In chords mode a single note is its own thing: "E note" is not the E chord.
  const played = ev.type === "note" && mode === "chords" ? `${ev.pitchClass}${NOTE_SUFFIX}` : playedLabel(ev);
  const wanted = h.wanted ?? [];
  const rec: PlayRecord = {
    t: new Date(performance.timeOrigin + ev.time).toISOString(),
    levelId: lv.id,
    world: lv.world,
    scene,
    mode,
    input: ev.source,
    practice: session.practice,
    played,
    target: h.hit && wanted.length === 1 ? wanted[0] : guessTarget(played, wanted, mode),
    wanted,
    hit: h.hit,
    grade: h.grade,
    offsetMs: h.offsetMs ?? null,
    confidence: Math.max(0, Math.min(1, ev.confidence)),
    latencyMs: ev.latencyMs !== undefined && ev.latencyMs >= 0 ? Math.round(ev.latencyMs) : null,
  };
  if (session.stats && !r.stats.includes(session.stats)) r.stats.push(session.stats);
  if (r.plays.length < MAX_RUN_PLAYS) r.plays.push(rec);
  if (!ONLINE) return;
  if (queueRunId !== r.id) {
    void flush();
    queueRunId = r.id;
  }
  queue.push(rec);
  flushTimer ??= setTimeout(() => void flush(), FLUSH_MS);
}

/** Quit to the title mid-run: send what's left, no summary. */
export function abandonRun(): void {
  if (!run) return;
  run = null;
  void flush();
}

/**
 * The End screen: the run's summary for the coach (null if no level was played since the title).
 * `stored` settles once the last plays and the summary are in Tiger Data (or failed), so ask the
 * coach after it and the history includes this run.
 */
export function endRun(info: GameOverInfo): { runId: string; summary: RunSummary; stored: Promise<void> } | null {
  const r = run;
  run = null;
  if (!r) return null;
  if (!r.stats.includes(info.stats)) r.stats.push(info.stats);
  const lv = levelAt(info.level);
  const summary = summarizeRun(r.plays, {
    levels: r.levels.length ? r.levels : [lv.id],
    world: lv.world,
    victory: info.victory,
    seconds: (Date.now() - r.startedAt) / 1000,
    mode: session.playMode,
    input: session.mode,
    practice: session.practice,
    slain: r.stats.reduce((n, s) => n + s.slain, 0),
    maxCombo: r.stats.reduce((n, s) => Math.max(n, s.maxCombo), 0),
  });
  let stored: Promise<void> = Promise.resolve();
  if (ONLINE) {
    // This run's last plays and its summary, sent under its own id (whatever starts next).
    const mine = queueRunId === r.id ? queue : [];
    const earlier = queueRunId === r.id ? Promise.resolve() : flush();
    if (queueRunId === r.id) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
      queue = [];
      queueRunId = null;
    }
    stored = earlier.then(() => sendPlays(r.id, mine, summary));
  }
  return { runId: r.id, summary, stored };
}

const coachCalls = new Map<string, Promise<CoachResult>>();

/** The lute's advice for a run: Gemini's if the backend can get it, else the built-in tips. Asked once per run. */
export function requestCoach(runId: string, summary: RunSummary): Promise<CoachResult> {
  let p = coachCalls.get(runId);
  if (!p) coachCalls.set(runId, (p = fetchCoach(runId, summary)));
  return p;
}

async function fetchCoach(runId: string, summary: RunSummary): Promise<CoachResult> {
  const local = (history: History | null = null, services: CoachResult["services"] = null): CoachResult => ({
    advice: localAdvice(summary, history),
    source: "local",
    model: null,
    history,
    services,
  });
  // Nothing played: nothing for Gemini to read.
  if (summary.tries === 0) return local();
  const r = await post("/coach", { playerId: playerId(), runId, run: summary }, { timeoutMs: COACH_TIMEOUT_MS });
  if (!r) return local();
  try {
    const data = (await r.json()) as Partial<CoachResult> & { source?: string | null };
    const history = data.history ?? null;
    const services = data.services ?? null;
    if (data.advice) return { advice: data.advice, source: "gemini", model: data.model ?? null, history, services };
    return local(history, services);
  } catch {
    return local();
  }
}
