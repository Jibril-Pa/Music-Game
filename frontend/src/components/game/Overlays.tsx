"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BossSongChoice, GameOverInfo } from "@/game/events";
import { listProcessedSongs, type JobSongInfo } from "@/lib/boss/songs";
import { PitchSmoother, STANDARD_TUNING, centsBetween, nearestNote, nearestString } from "@/lib/audio/pitch";
import { getNoteInput, type MicStatus } from "@/lib/input/noteInput";

// ------------------------------------------------------------------ title

export function TitleOverlay({ onStart, onSpellbook, mic, micError }: { onStart: (mode: "mic" | "keyboard") => void; onSpellbook: () => void; mic: MicStatus; micError?: string }) {
  return (
    <div className="gm-bottom gm-raised">
      <div className="gm-panel title-panel">
        <div className="title-buttons">
          <button className="gm-btn big primary" onClick={() => onStart("mic")} disabled={mic === "starting"}>
            {mic === "starting" ? "Opening the mic…" : "🎸 Play with my guitar"}
          </button>
          <button className="gm-btn big" onClick={() => onStart("keyboard")}>
            ⌨ Play with the keyboard
          </button>
          <button className="gm-btn" onClick={onSpellbook}>
            📖 Spellbook
          </button>
        </div>
        {micError && <p className="gm-error">Couldn&apos;t use the microphone: {micError} You can still play with the keyboard.</p>}
        <p className="title-help">
          Walk with <kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd>, jump with <kbd>Space</kbd>. Attack by <b>playing notes</b>: open strings E A D G B are
          enough. No guitar? <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd> <kbd>B</kbd> = E G A B D and <kbd>1</kbd>–<kbd>4</kbd> = Em G C D chords.{" "}
          <kbd>Esc</kbd> pauses. <Link href="/input-test">Test your input</Link> · <Link href="/preview">Song pipeline</Link>
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tuner

export function TuneOverlay({ onDone }: { onDone: () => void }) {
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
          <p>
            Tip: wear <b>headphones</b> so the mic only hears your guitar, not the game music.
          </p>
          <button className="gm-btn big primary" onClick={onDone}>
            {tuned.size >= 6 ? "All tuned! Into the forest →" : "Into the forest →"}
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
  return (
    <div className="gm-modal">
      <div className="gm-panel picker">
        <h2>Choose the Wolf&apos;s song</h2>
        <p className="muted">
          His attacks follow the song&apos;s easy chart. When a note orb reaches you, play that note to parry it. Between parries, strike back with combos.
        </p>
        {loading ? (
          <p className="picker-loading">Loading the song…</p>
        ) : (
          <div className="picker-list">
            <button className="gm-btn picker-item primary" onClick={() => onChoose({ kind: "demo", title: "Built-in demo" })}>
              ♪ The Wolf&apos;s Waltz <small>built-in demo, works offline</small>
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
  onSpellbook: () => void;
  onRestart: () => void;
  onQuit: () => void;
  mic: MicStatus;
  onMic: () => void;
}) {
  return (
    <div className="gm-modal">
      <div className="gm-panel pause">
        <h2>Paused</h2>
        <button className="gm-btn big primary" onClick={props.onResume}>
          Resume
        </button>
        <button className="gm-btn big" onClick={props.onSpellbook}>
          📖 Spellbook
        </button>
        <label className="sb-practice">
          <input type="checkbox" checked={props.practice} onChange={(e) => props.onPractice(e.target.checked)} /> Practice mode (wider timing windows)
        </label>
        <button className="gm-btn" onClick={props.onMic}>
          {props.mic === "on" ? "🎸 Mic on: turn off" : "🎸 Turn the mic on"}
        </button>
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

export function EndOverlay({ info, onAgain, onBoss, onTitle }: { info: GameOverInfo; onAgain: () => void; onBoss: () => void; onTitle: () => void }) {
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
            <b>{s.specials}</b>spells cast
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
          {!info.victory && info.scene === "Boss" && (
            <button className="gm-btn big primary" onClick={onBoss}>
              Retry the Wolf
            </button>
          )}
          <button className={`gm-btn big ${info.victory || info.scene !== "Boss" ? "primary" : ""}`} onClick={onAgain}>
            {info.victory ? "Play again" : "Restart from the forest"}
          </button>
          <button className="gm-btn" onClick={onTitle}>
            Title screen
          </button>
        </div>
      </div>
    </div>
  );
}
