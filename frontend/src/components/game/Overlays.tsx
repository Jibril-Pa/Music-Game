"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BossSongChoice, GameOverInfo } from "@/game/events";
import { LEVELS, WORLDS, isFinalLevel, levelAt, unlockedUpTo } from "@/game/levels";
import { session } from "@/game/state";
import { listProcessedSongs, type JobSongInfo } from "@/lib/boss/songs";
import { PitchSmoother, STANDARD_TUNING, centsBetween, nearestNote, nearestString } from "@/lib/audio/pitch";
import { getNoteInput, type MicStatus } from "@/lib/input/noteInput";
import type { PlayMode } from "@/lib/combat/spells";

// ------------------------------------------------------------------ title

/** Furthest level you can pick. Dev builds: /play?unlock opens every level (for testing). */
function readUnlocked(): number {
  if (typeof window === "undefined") return 0;
  if (process.env.NODE_ENV !== "production" && window.location.search.includes("unlock")) return LEVELS.length - 1;
  return unlockedUpTo();
}

/** Pick where the journey starts: levels you've reached are unlocked. */
function JourneyMap({ selected, unlocked, onSelect }: { selected: number; unlocked: number; onSelect: (i: number) => void }) {
  return (
    <div className="journey-map" aria-label="Choose a level">
      {(Object.keys(WORLDS) as (keyof typeof WORLDS)[]).map((w) => (
        <div key={w} className="jm-world">
          <div className="jm-era">
            {WORLDS[w].emoji} {WORLDS[w].era}
          </div>
          <div className="jm-levels">
            {LEVELS.map((lv, i) =>
              lv.world !== w ? null : (
                <button
                  key={lv.id}
                  className={`jm-level ${i === selected ? "on" : ""} ${lv.kind === "boss" ? "boss" : ""}`}
                  disabled={i > unlocked}
                  aria-pressed={i === selected}
                  title={i > unlocked ? "Beat the level before to unlock" : lv.name}
                  onClick={() => onSelect(i)}
                >
                  {i > unlocked ? "🔒" : lv.kind === "boss" ? "🐺" : ""} {lv.id}
                </button>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TitleOverlay({
  onStart,
  onBook,
  mic,
  micError,
  playMode,
  onPlayMode,
}: {
  onStart: (mode: "mic" | "keyboard", level: number) => void;
  onBook: () => void;
  mic: MicStatus;
  micError?: string;
  playMode: PlayMode;
  onPlayMode: (m: PlayMode) => void;
}) {
  // The game page only renders in the browser, so saved progress can be read right away.
  const [unlocked] = useState(readUnlocked);
  const [level, setLevel] = useState(readUnlocked);
  const lv = levelAt(level);
  return (
    <div className="gm-bottom gm-raised title-side">
      <div className="gm-panel title-panel">
        <div className="title-row">
          <div className="mode-toggle" role="radiogroup" aria-label="What foes ask for">
            <button className={`mode-btn ${playMode === "chords" ? "on" : ""}`} onClick={() => onPlayMode("chords")} aria-pressed={playMode === "chords"}>
              Chords <small>Em G D C Am</small>
            </button>
            <button className={`mode-btn ${playMode === "notes" ? "on" : ""}`} onClick={() => onPlayMode("notes")} aria-pressed={playMode === "notes"}>
              Single notes <small>easier: open strings</small>
            </button>
          </div>
          <JourneyMap selected={level} unlocked={unlocked} onSelect={setLevel} />
        </div>
        <div className="title-buttons">
          <button className="gm-btn big primary" onClick={() => onStart("mic", level)} disabled={mic === "starting"}>
            {mic === "starting" ? "Opening the mic…" : "🎸 Play with my guitar"}
          </button>
          <button className="gm-btn big" onClick={() => onStart("keyboard", level)}>
            ⌨ Play with the keyboard
          </button>
          <button className="gm-btn" onClick={onBook}>
            📖 {playMode === "chords" ? "Chord" : "Note"} Book
          </button>
        </div>
        {micError && <p className="gm-error">Couldn&apos;t use the microphone: {micError} You can still play with the keyboard.</p>}
        <p className="title-help">
          The Big Bad Wolf stole the Hourglass of Ages: chase him through time and <b>play the {playMode === "chords" ? "chord" : "note"} over each foe</b>.
          <br />
          <span className="muted small">
            Starting at <b>{lv.id}</b> {lv.name} · No guitar?{" "}
            {playMode === "chords" ? (
              <>
                keys <kbd>1</kbd>–<kbd>7</kbd> = Em G C D A Am E
              </>
            ) : (
              <>
                keys <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd> <kbd>B</kbd> <kbd>N</kbd> = E G A B D C
              </>
            )}{" "}
            · <kbd>Esc</kbd> pauses · <Link href="/input-test">Test your input</Link> · <Link href="/preview">Song pipeline</Link>
          </span>
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tuner

const INTO = { forest: "Into the forest →", desert: "Into the dunes →", future: "Into the city →" } as const;

export function TuneOverlay({ onDone, speakers, onSpeakers }: { onDone: () => void; speakers: boolean; onSpeakers: (on: boolean) => void }) {
  const [hz, setHz] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [tuned, setTuned] = useState<Set<string>>(new Set());
  const smoother = useRef(new PitchSmoother());
  const holdRef = useRef<{ id: string; since: number } | null>(null);

  useEffect(() => {
    return getNoteInput().onDiag((d) => {
      setLevel(d.rms);
      if (d.hz && d.pitchConfidence >= 0.85) {
        const v = smoother.current.push(d.hz);
        if (v) setHz(v);
      } else if (d.rms < 0.004) {
        smoother.current.reset();
      }
    });
  }, []);

  const reading = useMemo(() => {
    if (!hz) return null;
    const target = nearestString(hz);
    return { target, cents: centsBetween(hz, target.hz), note: nearestNote(hz) };
  }, [hz]);

  useEffect(() => {
    if (!reading) return;
    const now = performance.now();
    if (Math.abs(reading.cents) <= 8) {
      const h = holdRef.current;
      if (h?.id === reading.target.id) {
        if (now - h.since > 500 && !tuned.has(h.id)) setTuned((s) => new Set(s).add(h.id));
      } else holdRef.current = { id: reading.target.id, since: now };
    } else holdRef.current = null;
  }, [reading, tuned]);

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = reading && Math.abs(reading.cents) <= 8;
  return (
    <div className="gm-bottom">
      <div className="gm-panel tune-panel">
        <div className="tune-main">
          <div className={`tune-note ${inTune ? "ok" : ""}`}>{reading ? reading.note.label : "–"}</div>
          <div className="tune-meter">
            <div className="tune-center" />
            <div className="tune-needle" style={{ left: `${50 + cents}%`, opacity: reading ? 1 : 0.3 }} />
          </div>
          <div className="tune-hint">
            {!reading
              ? "Pluck one open string at a time"
              : inTune
                ? `${reading.target.id} is in tune!`
                : reading.cents < 0
                  ? `${reading.target.id}: tune up (${Math.round(reading.cents)} cents)`
                  : `${reading.target.id}: tune down (+${Math.round(reading.cents)} cents)`}
          </div>
          <div className="tune-strings">
            {STANDARD_TUNING.map((s) => (
              <span key={s.id} className={`tune-string ${tuned.has(s.id) ? "done" : ""} ${reading?.target.id === s.id ? "active" : ""}`}>
                {s.name}
                <small>{s.octave}</small>
              </span>
            ))}
          </div>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.min(100, level * 800)}%` }} />
          </div>
        </div>
        <div className="tune-side">
          <label className="sb-practice">
            <input type="checkbox" checked={speakers} onChange={(e) => onSpeakers(e.target.checked)} /> Laptop speakers (no headphones)
          </label>
          <p className="muted small">
            {speakers
              ? "The music plays quieter and the mic filters out the game's own sound. Headphones still work best."
              : "Headphones work best. Playing out loud? Tick this so the mic filters out the game's own sound."}
          </p>
          <button className="gm-btn big primary" onClick={onDone}>
            {tuned.size >= 6 ? "All tuned! " : ""}
            {INTO[levelAt(session.level).world]}
          </button>
          <p className="muted small">{tuned.size}/6 strings tuned · you can skip</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ boss song picker

export function BossPicker({ loading, onChoose }: { loading: boolean; onChoose: (c: BossSongChoice) => void }) {
  const [songs, setSongs] = useState<JobSongInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    listProcessedSongs().then((s) => alive && setSongs(s));
    return () => {
      alive = false;
    };
  }, []);
  const lv = levelAt(session.level);
  const boss = lv.kind === "boss" ? lv.boss : null;
  return (
    <div className="gm-modal">
      <div className="gm-panel picker">
        <h2>Choose {boss?.songOf ?? "the Wolf's song"}</h2>
        <p className="muted">
          {boss?.name ?? "The wolf"}&apos;s howls follow the song&apos;s easy chart: when one reaches you, play its chord (or note) to parry it. In between, his
          pack charges in and he shows his own chord: play it to strike him.
        </p>
        {loading ? (
          <p className="picker-loading">Loading the song…</p>
        ) : (
          <div className="picker-list">
            <button className="gm-btn picker-item primary" onClick={() => onChoose({ kind: "demo", title: "Built-in demo" })}>
              ♪ {boss?.demo.title ?? "The Wolf's Waltz"} <small>built-in demo, works offline</small>
            </button>
            {songs === null && <p className="muted small">Looking for processed songs…</p>}
            {songs?.map((s) => (
              <button key={s.jobId} className="gm-btn picker-item" onClick={() => onChoose({ kind: "job", jobId: s.jobId, title: s.title })}>
                ♪ {s.title}
                <small>
                  {s.source && s.source !== "guitar" ? `notes from the ${s.source === "mix" ? "full mix" : `${s.source} stem`} · ` : ""}
                  {s.bpm ? `${Math.round(s.bpm)} BPM` : ""} {s.durationSec ? `· ${Math.floor(s.durationSec / 60)}:${String(Math.round(s.durationSec % 60)).padStart(2, "0")}` : ""} · from
                  the song pipeline
                </small>
              </button>
            ))}
            {songs?.length === 0 && (
              <p className="muted small">
                No processed songs found (is the backend running?). Process one at <Link href="/preview">/preview</Link>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pause

export function PauseMenu(props: {
  practice: boolean;
  onPractice: (on: boolean) => void;
  onResume: () => void;
  onBook: () => void;
  onRestart: () => void;
  onQuit: () => void;
  mic: MicStatus;
  onMic: () => void;
  speakers: boolean;
  onSpeakers: (on: boolean) => void;
}) {
  return (
    <div className="gm-modal">
      <div className="gm-panel pause">
        <h2>Paused</h2>
        <button className="gm-btn big primary" onClick={props.onResume}>
          Resume
        </button>
        <button className="gm-btn big" onClick={props.onBook}>
          📖 Chord Book
        </button>
        <label className="sb-practice">
          <input type="checkbox" checked={props.practice} onChange={(e) => props.onPractice(e.target.checked)} /> Practice mode (wider timing; root notes count)
        </label>
        <button className="gm-btn" onClick={props.onMic}>
          {props.mic === "on" ? "🎸 Mic on: turn off" : "🎸 Turn the mic on"}
        </button>
        <label className="sb-practice">
          <input type="checkbox" checked={props.speakers} onChange={(e) => props.onSpeakers(e.target.checked)} /> Laptop speakers (no headphones)
        </label>
        <button className="gm-btn" onClick={props.onRestart}>
          Restart this stage
        </button>
        <button className="gm-btn" onClick={props.onQuit}>
          Quit to title
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ end

export function EndOverlay({
  info,
  onNext,
  onRetry,
  onRestart,
  onTitle,
}: {
  info: GameOverInfo;
  onNext: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onTitle: () => void;
}) {
  const lv = levelAt(info.level);
  const final = info.victory && isFinalLevel(info.level);
  const next = !final && info.victory ? levelAt(info.level + 1) : null;
  const s = info.stats;
  const secs = Math.round(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000);
  return (
    <div className="gm-bottom gm-raised end">
      <div className="gm-panel end-panel">
        <div className="end-stats">
          <span>
            <b>
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </b>
            time
          </span>
          <span>
            <b>{s.notesHeard}</b>notes played
          </span>
          <span>
            <b>{s.perfects}</b>perfect
          </span>
          <span>
            <b>{s.slain}</b>foes slain
          </span>
          <span>
            <b>
              {s.parries}/{s.parryAttempts}
            </b>
            parries
          </span>
          <span>
            <b>{s.maxCombo}</b>best combo
          </span>
        </div>
        <div className="title-buttons">
          {next && (
            <button className="gm-btn big primary" onClick={onNext}>
              🌀 Through the portal: {WORLDS[next.world].era} →
            </button>
          )}
          {!info.victory && (
            <button className="gm-btn big primary" onClick={onRetry}>
              Try {lv.id} again
            </button>
          )}
          {final && (
            <button className="gm-btn big primary" onClick={onRestart}>
              Travel again from the start
            </button>
          )}
          <button className="gm-btn" onClick={onTitle}>
            Title screen
          </button>
        </div>
      </div>
    </div>
  );
}
