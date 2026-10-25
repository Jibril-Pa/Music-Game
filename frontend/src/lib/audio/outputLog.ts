/**
 * What the game itself is playing, so the mic can tell the game's own sound
 * (leaking from laptop speakers) from the player's guitar.
 *
 * Two kinds of record, both in performance.now() ms *as heard* (see
 * gameAudio.ctxToPerf):
 *  - sounds the game schedules, with the pitch classes they contain ([] for
 *    unpitched sounds like drums, null when unknown, e.g. a recorded song);
 *  - the measured level of the game's final output, every ~11 ms, above
 *    ~200 Hz only (speakers differ most in how much bass they play; the echo
 *    guard cuts the mic's bass the same way), as the RMS over the last ~43 ms
 *    (4 hops: one hop is shorter than a low note's wave, so a single hop's
 *    level ripples).
 */

export interface OutputSound {
  at: number;
  until: number;
  pcs: readonly string[] | null;
}

const log: OutputSound[] = [];
/** Keep sounds this long after they end. */
const KEEP_MS = 4000;

export function logOutput(s: OutputSound): void {
  log.push(s);
  if (log.length > 300) prune(s.at);
}

function prune(now: number) {
  let w = 0;
  for (const s of log) if (s.until >= now - KEEP_MS) log[w++] = s;
  log.length = w;
}

/** Sounds that start inside [from, to]. */
export function outputOnsets(from: number, to: number): OutputSound[] {
  return log.filter((s) => s.at >= from && s.at <= to);
}

/** Sounds that are sounding at any point in [from, to]. */
export function outputSounding(from: number, to: number): OutputSound[] {
  return log.filter((s) => s.at <= to && s.until >= from);
}

/** Forget sounds scheduled after `now` (music stopped or paused before they played). */
export function dropFutureOutput(now: number = performance.now()): void {
  let w = 0;
  for (const s of log) if (s.at <= now) log[w++] = s;
  log.length = w;
}

/** Levels are measured above this (a 2nd-order high-pass, on the game's output and on the mic). */
export const LEVEL_HIGHPASS_HZ = 200;
/** Levels are RMS over this many hops. */
export const LEVEL_HOPS = 4;
const levelT: number[] = [];
const levelV: number[] = [];
const recentPow: number[] = [];

/** Level (RMS, bass cut) of the game's output for the hop ending at `t`. */
export function logOutputLevel(t: number, rms: number): void {
  recentPow.push(rms * rms);
  if (recentPow.length > LEVEL_HOPS) recentPow.shift();
  levelT.push(t);
  levelV.push(Math.sqrt(recentPow.reduce((a, b) => a + b, 0) / recentPow.length));
  if (levelT.length > 800) {
    levelT.splice(0, 200);
    levelV.splice(0, 200);
  }
}

/** Output levels (smoothed, see above) of the hops ending inside [from, to] (silence = no entries). */
export function outputLevels(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = levelT.length - 1; i >= 0 && levelT[i] >= from; i--) if (levelT[i] <= to) out.push(levelV[i]);
  return out;
}

export function clearOutputLog(): void {
  log.length = 0;
  levelT.length = 0;
  levelV.length = 0;
  recentPow.length = 0;
}
