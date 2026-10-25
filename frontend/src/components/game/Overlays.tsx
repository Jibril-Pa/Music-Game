"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { BossSongChoice, GameOverInfo } from "@/game/events";
import { LEVELS, WORLDS, isFinalLevel, levelAt, unlockedUpTo, type WorldId } from "@/game/levels";
import { session } from "@/game/state";
import { listProcessedSongs, type JobSongInfo } from "@/lib/boss/songs";
import { PitchSmoother, STANDARD_TUNING, centsBetween, nearestNote, nearestString } from "@/lib/audio/pitch";
import { getNoteInput, type MicStatus } from "@/lib/input/noteInput";
import type { PlayMode } from "@/lib/combat/spells";
import { Icon, iconFor } from "./Icon";
import Modal from "./Modal";

// ------------------------------------------------------------------ boot

/** First visit: the art is still on its way (the Boot scene). GameApp shows it only if that takes a while. */
export function BootPlate({ progress }: { progress: number }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="boot-slot">
      <div className="boot-plate plate">
        <span id="boot-l">Opening the storybook…</span>
        <div className="gm-bar boot-bar" role="progressbar" aria-labelledby="boot-l" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
          <div className="gm-bar-fill" aria-hidden="true" style={{ transform: `scaleX(${p})` }} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ title

/**
 * What the player sees when the mic fails (noteInput / micPipeline error strings).
 * `retry` is how to try again from where the message shows (the title's button, or the pause menu's switch).
 */
export function micMessage(err: string, retry = "press Play with my guitar again"): string {
  if (/permission/i.test(err))
    return `The game can’t hear your guitar: microphone access is blocked. Click the mic icon in the address bar, choose Allow, then ${retry}. No mic? Play with the keyboard.`;
  if (/No microphone/i.test(err)) return `No microphone found. Plug in a mic or a guitar interface, then ${retry}.`;
  if (/could not be started/i.test(err)) return "Another app (a video call?) is using the microphone. Close it and try again.";
  if (/HTTPS/.test(err)) return "The microphone only works on a secure page (https or localhost).";
  if (/disconnected/i.test(err)) return `The ear lost your microphone. Plug it back in and ${retry}.`;
  return `The microphone didn’t start (${err.replace(/\.$/, "")}). You can still play with the keyboard.`;
}

/** Furthest level you can pick. Dev builds: /play?unlock opens every level (for testing). */
function readUnlocked(): number {
  if (typeof window === "undefined") return 0;
  if (process.env.NODE_ENV !== "production" && window.location.search.includes("unlock")) return LEVELS.length - 1;
  return unlockedUpTo();
}

const SHORT_ERA: Record<WorldId, string> = { forest: "Once Upon a Time", desert: "1001 Nights", future: "Year 3000" };

/** Pick where the journey starts: levels you've reached are unlocked. */
function JourneyMap({ selected, unlocked, onSelect, labelledBy }: { selected: number; unlocked: number; onSelect: (i: number) => void; labelledBy: string }) {
  return (
    <div className="journey-map" role="group" aria-labelledby={labelledBy}>
      {(Object.keys(WORLDS) as WorldId[]).map((w) => (
        <fieldset key={w} className="jm-world">
          <legend className="jm-era" title={WORLDS[w].era}>
            <Icon name={iconFor(WORLDS[w].emoji, "pine")} /> {SHORT_ERA[w]}
          </legend>
          <div className="jm-levels">
            {LEVELS.map((lv, i) => {
              if (lv.world !== w) return null;
              const locked = i > unlocked;
              const boss = lv.kind === "boss";
              const label = `${lv.id} ${lv.name}${locked ? `, locked: finish ${LEVELS[i - 1]?.id ?? "the level before"} first` : boss ? ", boss fight" : ""}`;
              return (
                <button
                  key={lv.id}
                  className={`gm-btn jm-level num${boss ? " boss" : ""}`}
                  disabled={locked}
                  aria-pressed={i === selected}
                  aria-label={label}
                  title={label}
                  onClick={() => onSelect(i)}
                >
                  {lv.id}
                  {locked ? <Icon name="lock" /> : boss ? <Icon name="wolf" /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
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
  const chords = playMode === "chords";
  return (
    <div className="gm-bottom gm-raised title-side">
      <section className="gm-panel title-panel" aria-labelledby="title-h">
        <h1 id="title-h" className="sr-only">
          The Traveling Bard
        </h1>
        <p className="title-lede">Play the {chords ? "chord" : "note"} over each foe to chase the Wolf through time.</p>
        <div className="title-buttons">
          <button className="gm-btn big primary play-guitar" onClick={() => onStart("mic", level)} disabled={mic === "starting"}>
            <Icon name="lute" />
            <span>{mic === "starting" ? "Opening the mic…" : "Play with my guitar"}</span>
            <small>uses your mic · nothing is recorded</small>
          </button>
          <button className="gm-btn play-keys" onClick={() => onStart("keyboard", level)}>
            <Icon name="keys" />
            <span>Play with the keyboard</span>
            <small>{chords ? "keys 1–7" : "keys Z X C V B N"}</small>
          </button>
          <button className="gm-btn play-book" onClick={onBook}>
            <Icon name="book" />
            {chords ? "Chord" : "Note"} Book
          </button>
        </div>
        {mic === "error" && micError && (
          <p className="gm-error" role="alert">
            {micMessage(micError)}
          </p>
        )}
        <div className="title-choice">
          <span className="title-label" id="mode-l">
            What can you play?
          </span>
          <div className="seg mode-toggle" role="group" aria-labelledby="mode-l">
            <button onClick={() => onPlayMode("chords")} aria-pressed={chords}>
              Chords <small>Em G D C Am</small>
            </button>
            <button onClick={() => onPlayMode("notes")} aria-pressed={!chords}>
              Single notes <small>easiest: open strings</small>
            </button>
          </div>
        </div>
        <div className="title-choice">
          <span className="title-label" id="map-l">
            Start at
          </span>
          <JourneyMap selected={level} unlocked={unlocked} onSelect={setLevel} labelledBy="map-l" />
        </div>
      </section>
    </div>
  );
}

/** Phones held upright: the bard's road needs a landscape screen. */
export function RotateCard() {
  const [dismissed, setDismissed] = useState(false);
  return (
    <div className="rotate-card" hidden={dismissed} role="dialog" aria-labelledby="rotate-h">
      <div className="gm-panel">
        <h2 id="rotate-h">Turn your phone sideways</h2>
        <p>The bard&rsquo;s road is wide: the game fits best in landscape.</p>
        <button className="gm-btn primary" onClick={() => setDismissed(true)}>
          Play anyway
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tuner

/** Headphones or laptop speakers (pause menu and tuner): the ear filters the game's own sound in speaker mode. */
function SoundChoice({ id, speakers, onSpeakers }: { id: string; speakers: boolean; onSpeakers: (on: boolean) => void }) {
  return (
    <div className="sound-choice">
      <span className="sound-label" id={id}>
        Sound comes from:
      </span>
      <div className="seg" role="group" aria-labelledby={id}>
        <button aria-pressed={!speakers} onClick={() => onSpeakers(false)}>
          <Icon name="headphones" /> Headphones
        </button>
        <button aria-pressed={speakers} onClick={() => onSpeakers(true)}>
          <Icon name="speaker" /> Laptop speakers
        </button>
      </div>
      <small>{speakers ? "The music plays quieter so the ear can hear your guitar." : "Best: the ear only hears your guitar."}</small>
    </div>
  );
}

/**
 * Which microphone (tuner and pause menu). In a noisy room a clip-on mic, or a guitar cable into an
 * audio interface, beats the laptop's mic. Only shown when there's more than one.
 */
function MicChoice({ mic }: { mic: MicStatus }) {
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [picked, setPicked] = useState(() => getNoteInput().deviceId ?? "");
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.enumerateDevices) return;
    let live = true;
    const load = () => {
      md.enumerateDevices()
        .then((all) => {
          if (!live) return;
          // "default" and "communications" are aliases of real devices (Chrome).
          const inputs = all.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
          setDevices(inputs.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
          setPicked(getNoteInput().deviceId ?? "");
        })
        .catch(() => {});
    };
    load();
    md.addEventListener("devicechange", load);
    return () => {
      live = false;
      md.removeEventListener("devicechange", load);
    };
  }, [mic]); // names show up once the mic is allowed
  if (devices.length < 2) return null;
  const value = devices.some((d) => d.id === picked) ? picked : "";
  return (
    <label className="mic-choice">
      <span className="sound-label">Microphone:</span>
      <select
        value={value}
        disabled={mic === "starting"}
        onChange={(e) => {
          setPicked(e.target.value);
          void getNoteInput().setDevice(e.target.value || undefined);
        }}
      >
        <option value="">The computer&rsquo;s default</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * How your guitar stands out from the room (the crowd's level vs your plucks), with what to do about
 * it. Measured on the tuner's single plucks, which are a little softer than strums.
 */
function roomCheck(floor: number, player: number | null): { tone: "ok" | "warn" | "bad"; text: string } {
  if (!player) return { tone: "warn", text: "Pluck a few strings to check the room" };
  const r = floor / player;
  if (r < 0.18) return { tone: "ok", text: "Room check: the ear hears your guitar clearly" };
  if (r < 0.32) return { tone: "warn", text: "Room check: a bit noisy. If notes get missed, bring the mic closer to your guitar" };
  return { tone: "bad", text: "Room check: too noisy for this mic. Put the mic right by your guitar, or use a clip-on mic" };
}

const STRING_NAME: Record<string, string> = { E2: "low E", A2: "A", D3: "D", G3: "G", B3: "B", E4: "high e" };
const COIN: Record<string, string> = { E2: "E", A2: "A", D3: "D", G3: "G", B3: "B", E4: "e" };
const PLACE: Record<WorldId, string> = { forest: "the forest", desert: "the dunes", future: "the city" };

function tuneHint(reading: { target: { id: string; name: string }; cents: number } | null): string {
  if (!reading) return "Pluck one open string at a time";
  const name = STRING_NAME[reading.target.id] ?? reading.target.name;
  const c = reading.cents;
  if (Math.abs(c) <= 8) return `The ${name} string is in tune!`;
  if (c < -25) return `The ${name} string is low: tighten the peg slowly`;
  if (c < 0) return `The ${name} string is a little low: tighten the peg a tiny bit`;
  if (c > 25) return `The ${name} string is high: loosen the peg slowly`;
  return `The ${name} string is a little high: loosen the peg a tiny bit`;
}

export function TuneOverlay({
  onDone,
  speakers,
  onSpeakers,
  mic,
  micError,
}: {
  onDone: () => void;
  speakers: boolean;
  onSpeakers: (on: boolean) => void;
  mic: MicStatus;
  micError?: string;
}) {
  const [hz, setHz] = useState<number | null>(null);
  const [level, setLevel] = useState<{ rms: number; floor: number; player: number | null }>({ rms: 0, floor: 0, player: null });
  const [tuned, setTuned] = useState<Set<string>>(new Set());
  const smoother = useRef(new PitchSmoother());
  const holdRef = useRef<{ id: string; since: number } | null>(null);

  useEffect(() => {
    return getNoteInput().onDiag((d) => {
      setLevel({ rms: d.rms, floor: d.noiseFloor, player: d.playerLevel });
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
  const inTune = !!reading && Math.abs(reading.cents) <= 8;
  const hears = level.rms > 2 * Math.max(0.002, level.floor);
  const room = roomCheck(level.floor, level.player);
  const place = PLACE[levelAt(session.level).world];
  return (
    <div className="tune-slot">
      <section className="gm-panel tune-panel" aria-labelledby="tune-h">
        <h2 id="tune-h" className="sr-only">
          Tune your guitar
        </h2>
        <div className="tune-left">
          <div className="tune-reading" aria-hidden="true">
            <div className={`tune-note${inTune ? " ok" : ""}`}>{reading ? reading.note.label : "–"}</div>
            <div className="tune-gauge">
              <div className="tune-meter">
                <div className="tune-center" />
                <div className="tune-needle" style={{ left: `${50 + cents}%` }} data-idle={reading ? undefined : "1"} />
              </div>
              <div className="tune-scale">
                <span>low</span>
                <span>in tune</span>
                <span>high</span>
              </div>
            </div>
          </div>
          <p className="tune-hint" role="status">
            {tuneHint(reading)}
          </p>
          <div className="tune-strings">
            <span className="tune-cap">thickest</span>
            {STANDARD_TUNING.map((s) => {
              const done = tuned.has(s.id);
              return (
                <span
                  key={s.id}
                  className={`tune-string${done ? " done" : ""}${reading?.target.id === s.id ? " active" : ""}`}
                  title={`The ${STRING_NAME[s.id]} string${done ? ": in tune" : ""}`}
                >
                  {COIN[s.id]}
                  {done && <Icon name="check" />}
                </span>
              );
            })}
            <span className="tune-cap">thinnest</span>
          </div>
          <div className="sb-level" aria-hidden="true">
            <span>mic</span>
            <div className="sb-level-bar">
              <div className="sb-level-fill" style={{ transform: `scaleX(${Math.min(1, level.rms * 8)})` }} />
            </div>
            {hears && <b>The ear hears you</b>}
          </div>
          {mic === "on" && (
            <p className="room-check" data-tone={room.tone} aria-live="polite">
              {room.text}
            </p>
          )}
        </div>
        <div className="tune-right">
          <SoundChoice id="tune-sound" speakers={speakers} onSpeakers={onSpeakers} />
          <MicChoice mic={mic} />
          <button className="gm-btn big primary tune-go" onClick={onDone}>
            <span>{tuned.size >= 6 ? `All tuned! Into ${place} →` : `Into ${place} →`}</span>
            {tuned.size === 0 && <small>skip the tuning</small>}
          </button>
          <p className="tune-progress num">{tuned.size} of 6 strings in tune</p>
          {mic === "error" && micError && (
            <p className="gm-error" role="alert">
              {micMessage(micError)}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ boss song picker

const fmtDuration = (sec?: number) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "");

/** Where a processed song's notes came from, when it isn't the guitar stem. */
function sourceNote(source?: string): string {
  if (!source || source === "guitar") return "";
  return source === "mix" ? " · from the full mix" : ` · from the ${source} track`;
}

interface SongGroup {
  main: JobSongInfo;
  others: JobSongInfo[];
}

/** One row per title (trimmed, case-insensitive); the guitar stem first, other versions folded away. */
function groupSongs(songs: JobSongInfo[]): SongGroup[] {
  const hideTests = process.env.NODE_ENV === "production";
  const groups = new Map<string, JobSongInfo[]>();
  for (const s of songs) {
    if (hideTests && /\btest\b/i.test(s.title)) continue;
    const k = s.title.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()].map((list) => {
    const main = list.find((s) => !s.source || s.source === "guitar") ?? list[0];
    return { main, others: list.filter((s) => s !== main) };
  });
}

function SongRow({ song, onChoose }: { song: JobSongInfo; onChoose: (c: BossSongChoice) => void }) {
  const sub = [fmtDuration(song.durationSec), song.bpm ? `${Math.round(song.bpm)} BPM` : ""].filter(Boolean).join(" · ") + sourceNote(song.source);
  return (
    <button className="gm-btn picker-item" onClick={() => onChoose({ kind: "job", jobId: song.jobId, title: song.title })}>
      <Icon name="note" />
      <span className="pi-title">{song.title.trim()}</span>
      {sub && <small className="num">{sub}</small>}
    </button>
  );
}

export function BossPicker({
  loading,
  playMode,
  inert,
  onChoose,
  onBack,
}: {
  loading: boolean;
  playMode: PlayMode;
  inert: boolean;
  onChoose: (c: BossSongChoice) => void;
  onBack: () => void;
}) {
  const [songs, setSongs] = useState<JobSongInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    listProcessedSongs().then((s) => alive && setSongs(s));
    return () => {
      alive = false;
    };
  }, []);
  const groups = useMemo(() => groupSongs(songs ?? []), [songs]);
  const lv = levelAt(session.level);
  const boss = lv.kind === "boss" ? lv.boss : null;
  const what = playMode === "chords" ? "chord" : "note";
  return (
    <Modal labelledBy="picker-h" initialFocus=".picker-featured" inert={inert} className="picker-modal">
      <div className="gm-panel picker">
        <h2 id="picker-h">Choose {boss?.songOf ?? "the Wolf’s song"}</h2>
        <p className="picker-intro">
          {boss?.name ?? "The wolf"} howls along to the song. When a howl reaches you, play its {what} to send it back at him. Between verses, play the{" "}
          {what} over the wolf to strike.
        </p>
        {loading ? (
          <p className="picker-loading" role="status">
            Loading the song…
          </p>
        ) : (
          <>
            <button className="gm-btn picker-item picker-featured primary" onClick={() => onChoose({ kind: "demo", title: "Built-in demo" })}>
              <Icon name="note" />
              <span className="pi-title">{boss?.demo.title ?? "The Wolf’s Waltz"}</span>
              <small className="num">built-in demo · works offline · {boss?.demo.bpm ?? 104} BPM</small>
            </button>
            <h3 className="picker-h">
              Your songs <small>from the Song Workshop</small>
            </h3>
            {songs === null ? (
              <p className="picker-note">Looking for your songs…</p>
            ) : groups.length === 0 ? (
              <p className="picker-note">
                No songs yet: <Link href="/preview">make one in the Song Workshop</Link>
              </p>
            ) : (
              <div className="picker-list">
                {groups.map((g) => (
                  <div key={g.main.jobId} className="picker-group">
                    <SongRow song={g.main} onChoose={onChoose} />
                    {g.others.length > 0 && (
                      <details className="picker-more">
                        <summary>
                          {g.others.length} other version{g.others.length === 1 ? "" : "s"}
                        </summary>
                        {g.others.map((o) => (
                          <SongRow key={o.jobId} song={o} onChoose={onChoose} />
                        ))}
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="picker-foot">
          <button className="gm-btn picker-back" onClick={onBack} disabled={loading}>
            ← Back to the title <small>or press Esc</small>
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ pause

export type PauseConfirm = "restart" | "quit" | null;

export function PauseMenu({
  inert,
  returnFocus,
  levelId,
  playMode,
  practice,
  onPractice,
  onResume,
  onBook,
  confirm,
  onConfirm,
  onRestart,
  onQuit,
  mic,
  micError,
  micAlert,
  onMic,
  speakers,
  onSpeakers,
}: {
  inert: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  levelId: string;
  playMode: PlayMode;
  practice: boolean;
  onPractice: (on: boolean) => void;
  onResume: () => void;
  onBook: () => void;
  confirm: PauseConfirm;
  onConfirm: (c: PauseConfirm) => void;
  onRestart: () => void;
  onQuit: () => void;
  mic: MicStatus;
  micError?: string;
  micAlert: "lost" | "back" | null;
  onMic: () => void;
  speakers: boolean;
  onSpeakers: (on: boolean) => void;
}) {
  const chords = playMode === "chords";
  const lost = micAlert === "lost";
  const keepRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const openedFrom = useRef<PauseConfirm>(null);
  const wasLost = useRef(lost);
  // The mic is back: "Turn the mic back on" is gone, and the focus with it. Resume is the way on
  // (unless the focus is still on something else in here, like the Listen switch).
  useEffect(() => {
    const resume = resumeRef.current;
    if (wasLost.current && micAlert === "back" && resume && !resume.closest(".gm-modal")?.contains(document.activeElement)) resume.focus();
    wasLost.current = micAlert === "lost";
  }, [micAlert]);
  // A confirm takes the leave row and focuses "Keep playing"; cancelling it goes back to the button that asked.
  useEffect(() => {
    if (confirm) {
      openedFrom.current = confirm;
      keepRef.current?.focus();
    } else if (openedFrom.current) {
      leaveRef.current?.querySelector<HTMLButtonElement>(openedFrom.current === "restart" ? ".pause-restart" : ".pause-quit")?.focus();
      openedFrom.current = null;
    }
  }, [confirm]);
  const micLine =
    mic === "starting"
      ? "Opening the mic…"
      : mic === "on"
        ? "The ear is listening"
        : mic === "error" && micError
          ? micMessage(micError, "switch this back on")
          : "uses the microphone";
  return (
    <Modal labelledBy="pause-h" initialFocus=".pause-resume" returnFocus={returnFocus} inert={inert} className="pause-modal">
      <div className="gm-panel pause">
        <h2 id="pause-h">Paused</h2>
        {micAlert && (
          <div className={`pause-alert${lost ? "" : " is-back"}`} role="alert">
            <Icon name="mic" />
            {lost ? (
              <p>
                <b>The ear lost your microphone.</b> Plug it back in, then:
              </p>
            ) : (
              <p>
                <b>The ear hears you again.</b>
              </p>
            )}
            {lost && (
              <button className="gm-btn primary" onClick={onMic} disabled={mic === "starting"}>
                {mic === "starting" ? "Opening the mic…" : "Turn the mic back on"}
              </button>
            )}
          </div>
        )}
        <div className="pause-main">
          <button ref={resumeRef} className={`gm-btn big pause-resume${lost ? "" : " primary"}`} onClick={onResume}>
            Resume
          </button>
          <button className="gm-btn big pause-book" onClick={onBook}>
            <Icon name="book" /> {chords ? "Chord" : "Note"} Book
          </button>
        </div>
        {lost && <p className="pause-keys">Resume plays on with {chords ? "keys 1–7" : "keys Z X C V B N"}.</p>}
        <section className="pause-group" aria-labelledby="set-h">
          <h3 id="set-h" className="pause-h">
            Settings
          </h3>
          <label className="sb-switch">
            <input type="checkbox" role="switch" checked={mic === "on" || mic === "starting"} disabled={mic === "starting"} onChange={onMic} />
            <span>
              <Icon name="lute" /> Listen to my guitar
            </span>
            <small className={mic === "error" ? "is-error" : undefined}>{micLine}</small>
          </label>
          <SoundChoice id="pause-sound" speakers={speakers} onSpeakers={onSpeakers} />
          {mic === "on" && <MicChoice mic={mic} />}
          <label className="sb-switch">
            <input type="checkbox" role="switch" checked={practice} onChange={(e) => onPractice(e.target.checked)} />
            <span>Practice mode</span>
            <small>{chords ? "More time around the beat. A chord’s root note alone also counts (an E for Em)." : "More time around the beat."}</small>
          </label>
        </section>
        <div className="pause-leave" ref={leaveRef}>
          {confirm ? (
            <>
              <p className="pause-confirm">{confirm === "restart" ? `Restart ${levelId}? This run starts over.` : "Quit to the title? Your unlocked levels stay saved."}</p>
              <button className="gm-btn" onClick={confirm === "restart" ? onRestart : onQuit}>
                {confirm === "restart" ? `Restart ${levelId}` : "Quit"}
              </button>
              <button ref={keepRef} className="gm-btn" onClick={() => onConfirm(null)}>
                Keep playing
              </button>
            </>
          ) : (
            <>
              <button className="gm-btn pause-restart" onClick={() => onConfirm("restart")}>
                Restart {levelId}
              </button>
              <button className="gm-btn pause-quit" onClick={() => onConfirm("quit")}>
                Quit to the title
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ end

/** "1 foe", "2 foes", "0 foes". */
const plural = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

interface EndSummary {
  heading: string;
  /** The first stat: howls sent back in a boss level (its pups never come), foes slain elsewhere. */
  lead: { n: number; of?: number; label: string };
  /** The line under the stats: time, then inputs right. */
  line: string[];
}

/** What the End page says (EndOverlay shows it; GameApp announces it). */
export function endSummary(info: GameOverInfo, playMode: PlayMode): EndSummary {
  const lv = levelAt(info.level);
  const final = info.victory && isFinalLevel(info.level);
  const s = info.stats;
  const secs = Math.max(0, Math.round(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000));
  const hits = s.hits ?? 0;
  const tries = hits + (s.misses ?? 0);
  const boss = lv.kind === "boss";
  const line = [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`];
  if (tries > 0) line.push(`${hits} of ${tries} ${plural(tries, playMode === "notes" ? "note" : "chord")} right`);
  if (!boss && s.parryAttempts > 0) line.push(`${s.parries} of ${s.parryAttempts} ${plural(s.parryAttempts, "howl")} sent back`);
  const lead = boss
    ? s.parryAttempts > 0
      ? { n: s.parries, of: s.parryAttempts, label: `${plural(s.parryAttempts, "howl")} sent back` }
      : { n: 0, label: "howls sent back" }
    : { n: s.slain, label: `${plural(s.slain, "foe")} slain` };
  const heading = final ? "Happily Ever After!" : info.victory ? `${WORLDS[lv.world].era}: saved!` : "The tale is not over…";
  return { heading, lead, line };
}

/** The End page in one sentence, for the screen-reader announcer. */
export function endAnnouncement(info: GameOverInfo, playMode: PlayMode): string {
  const { heading, lead, line } = endSummary(info, playMode);
  const first = `${lead.n}${lead.of !== undefined ? ` of ${lead.of}` : ""} ${lead.label}`;
  return `${heading} ${[first, ...line].join(", ")}.`;
}

export function EndOverlay({
  info,
  playMode,
  practice,
  onPractice,
  onNext,
  onRetry,
  onRestart,
  onTitle,
}: {
  info: GameOverInfo;
  playMode: PlayMode;
  practice: boolean;
  onPractice: (on: boolean) => void;
  onNext: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onTitle: () => void;
}) {
  const lv = levelAt(info.level);
  const final = info.victory && isFinalLevel(info.level);
  const next = info.victory && !final ? levelAt(info.level + 1) : null;
  const s = info.stats;
  const { heading, lead, line } = endSummary(info, playMode);
  // Keyboard focus on the way on (the fight left it on the game frame).
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="gm-bottom gm-raised end">
      <section className={`gm-panel end-panel${info.victory ? "" : " end-panel--defeat"}`} aria-labelledby="end-h">
        <h2 id="end-h" className="sr-only">
          {heading}
        </h2>
        <div className="end-stats">
          <div>
            <b className="num">
              {lead.n}
              {lead.of !== undefined && <small> of {lead.of}</small>}
            </b>
            <span>{lead.label}</span>
          </div>
          <div>
            <b className="num">{s.perfects}</b>
            <span>perfect</span>
          </div>
          <div>
            <b className="num">{s.maxCombo}</b>
            <span>best combo</span>
          </div>
        </div>
        <p className="end-line num">{line.join(" · ")}</p>
        {!info.victory && (
          <label className="sb-switch">
            <input type="checkbox" role="switch" checked={practice} onChange={(e) => onPractice(e.target.checked)} />
            <span>Practice mode</span>
            <small>More time around the beat</small>
          </label>
        )}
        <div className="end-buttons">
          {next && next.world !== lv.world ? (
            <button ref={primaryRef} className="gm-btn primary end-next" onClick={onNext}>
              <Icon name="portal" />
              <span>Through the portal:</span>
              <small>{WORLDS[next.world].era} →</small>
            </button>
          ) : next ? (
            <button ref={primaryRef} className="gm-btn primary" onClick={onNext}>
              On to {next.id}: {next.name} →
            </button>
          ) : final ? (
            <button ref={primaryRef} className="gm-btn primary" onClick={onRestart}>
              Travel again from the start
            </button>
          ) : (
            <button ref={primaryRef} className="gm-btn primary" onClick={onRetry}>
              Try {lv.id} again
            </button>
          )}
          <button className="gm-btn end-title" onClick={onTitle}>
            Back to the title
          </button>
        </div>
      </section>
    </div>
  );
}
