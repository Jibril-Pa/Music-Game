"use client";

/**
 * /play: Phaser game + React HUD and menus, talking over the EventBus
 * (pattern from phaserjs/template-nextjs). Owns the note input: the mic is
 * released when this unmounts (leaving /play).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Phaser from "phaser";
import { EventBus } from "@/game/EventBus";
import { EV, type BossSongChoice, type GameOverInfo, type HeardEntry, type HudState } from "@/game/events";
import { STORYBOOK_TYPE } from "@/game/fonts";
import { isFinalLevel, levelAt, sceneFor } from "@/game/levels";
import { goTo } from "@/game/main";
import { PhaserGame, type IRefPhaserGame } from "@/game/PhaserGame";
import { newStats, session } from "@/game/state";
import { abandonRun, beginLevel, endRun, recordPlay, requestCoach } from "@/lib/coach/log";
import { gameAudio } from "@/lib/game-audio/audio";
import { installDevHooks } from "@/lib/input/devHooks";
import { disposeNoteInput, getNoteInput, type MicStatus } from "@/lib/input/noteInput";
import type { PlayMode } from "@/lib/combat/spells";
import ChordBook from "./ChordBook";
import { ChordHelper } from "./ChordHelper";
import DevOverlay from "./DevOverlay";
import { Ear } from "./Ear";
import { Hud } from "./Hud";
import { LuteCard, LuteNotes, type CoachState } from "./Lute";
import { BootPlate, BossPicker, EndOverlay, PauseMenu, RotateCard, TitleOverlay, TuneOverlay, endAnnouncement, type PauseConfirm } from "./Overlays";

const FIGHT_SCENES = new Set(["Journey", "Boss"]);

const SPEAKERS_KEY = "traveling-bard:laptop-speakers";

/** The chord-box legend stays on the NOW card until this many right inputs (this page session). */
const LEGEND_HITS = 10;

/**
 * Boot's loading plate is for a slow download only. From BOOT_PLATE_DELAY_MS after the first PNG lands,
 * it goes up if the rest of the art, at the rate so far, needs more than BOOT_PLATE_ETA_MS (a warm cache
 * delivers the whole set within ~50 ms of the first file), or if no second file has come within
 * BOOT_PLATE_ETA_MS, or no file at all within BOOT_PLATE_NOTHING_MS. Once up, it stays until the title.
 */
const BOOT_PLATE_DELAY_MS = 150;
const BOOT_PLATE_ETA_MS = 400;
const BOOT_PLATE_NOTHING_MS = 1000;

/**
 * A bannered objective stays up at least this long. A change after that shows at once; changes during
 * it wait for its end, and only the latest one shows. So the banner is never more than this behind the
 * game, however often the objective flips (the first one of a scene shows at once).
 */
const OBJECTIVE_HOLD_MS = 1200;

type Light = "day" | "night" | "neon";

/** The paper is lit by the world behind it (night and neon levels dim the parchment a little). */
function lightFor(scene: string, level: number, end?: GameOverInfo): Light {
  const lv = levelAt(level);
  const dark: Light = lv.world === "future" ? "neon" : "night";
  if (scene === "Tune") return "night";
  if (scene === "Journey") return lv.kind === "journey" && lv.night ? dark : "day";
  if (scene === "Boss") return lv.world === "forest" ? "day" : lv.world === "desert" ? "night" : "neon";
  if (scene === "End" && end) return !end.victory || isFinalLevel(end.level) ? (levelAt(end.level).world === "future" ? "neon" : "night") : "day";
  return "day";
}

/** Laptop-speaker mode as last chosen in this browser (off if unknown or storage is blocked). */
function readSpeakers(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(SPEAKERS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function GameApp() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef("Boot");
  const prevMic = useRef<MicStatus>("off");
  /** Objective pacing (OBJECTIVE_HOLD_MS): the latest objective from the HUD, and the one bannered (null: none yet this scene). */
  const liveObjective = useRef<string | undefined>(undefined);
  const shownObjective = useRef<{ text?: string; at: number } | null>(null);
  const objectiveTimer = useRef<number | undefined>(undefined);
  const lastAnnounced = useRef<string | undefined>(undefined);
  const magicFull = useRef(false);
  const [scene, setScene] = useState("Boot");
  /** Bumped on every scene start: remounts the HUD pieces (clears the banner and the NOW card). */
  const [sceneSerial, setSceneSerial] = useState(0);
  const [light, setLight] = useState<Light>("day");
  const [hud, setHud] = useState<HudState | null>(null);
  /** The objective as bannered and announced, paced by OBJECTIVE_HOLD_MS. */
  const [objective, setObjective] = useState<string | undefined>(undefined);
  const [heard, setHeard] = useState<HeardEntry[]>([]);
  const [rightHits, setRightHits] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [paused, setPausedState] = useState(false);
  const [book, setBook] = useState(false);
  const [confirm, setConfirm] = useState<PauseConfirm>(null);
  const [playMode, setPlayModeState] = useState<PlayMode>("chords");
  const [dev, setDev] = useState(false);
  const [practice, setPracticeState] = useState(false);
  const [mic, setMic] = useState<MicStatus>("off");
  const [micError, setMicError] = useState<string | undefined>();
  const [micAlert, setMicAlert] = useState<"lost" | "back" | null>(null);
  const [bossIntro, setBossIntro] = useState(false);
  const [bossLoading, setBossLoading] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  /** The lute's advice for the run that just ended (End screen), and whether its notebook is open. */
  const [coach, setCoach] = useState<CoachState | null>(null);
  const [notes, setNotes] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** Boot's art download (0..1), and whether the loading plate is up. */
  const [bootProgress, setBootProgress] = useState(0);
  const [bootPlate, setBootPlate] = useState(false);

  const inFight = FIGHT_SCENES.has(scene);
  const modalOpen = book || paused || notes || (scene === "Boss" && bossIntro);

  /** Say something to screen readers (the polite live region; a repeat still gets read). */
  const announce = useCallback((msg: string) => {
    setAnnouncement((a) => (a === msg ? `${msg} ` : msg));
  }, []);

  const setPaused = useCallback((p: boolean) => {
    session.paused = p;
    setPausedState(p);
    if (!p) {
      setBook(false);
      setConfirm(null);
      setMicAlert(null);
    }
    EventBus.emit(EV.setPaused, p);
  }, []);

  const setPlayMode = useCallback((m: PlayMode) => {
    session.playMode = m;
    setPlayModeState(m);
  }, []);

  const setPractice = useCallback((on: boolean) => {
    session.practice = on;
    setPracticeState(on);
  }, []);

  // Laptop-speaker mode (no headphones): quieter music + the browser's echo
  // cancellation on the mic. Remembered in this browser.
  const [speakers, setSpeakersState] = useState(readSpeakers);
  const setSpeakers = useCallback((on: boolean) => {
    setSpeakersState(on);
    try {
      localStorage.setItem(SPEAKERS_KEY, on ? "1" : "0");
    } catch {
      // Storage blocked: the setting just isn't remembered.
    }
  }, []);
  useEffect(() => {
    gameAudio.setDucked(speakers);
    void getNoteInput().setSpeakerMode(speakers);
  }, [speakers]);

  // prefers-reduced-motion: the canvas reads session.reducedMotion (fx.ts), the DOM uses the media query.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    session.reducedMotion = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      session.reducedMotion = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Boot: follow the art download, and put the loading plate up if it is slow (BOOT_PLATE_DELAY_MS).
  useEffect(() => {
    if (scene !== "Boot") return;
    let progress = 0;
    let first: { at: number; progress: number } | null = null;
    let delay: number | undefined;
    const nothing = window.setTimeout(() => {
      if (!first) setBootPlate(true);
    }, BOOT_PLATE_NOTHING_MS);
    const check = () => {
      if (!first || progress >= 1) return;
      const elapsed = performance.now() - first.at;
      if (elapsed < BOOT_PLATE_DELAY_MS) return;
      const rate = (progress - first.progress) / elapsed;
      if (rate > 0) {
        if ((1 - progress) / rate > BOOT_PLATE_ETA_MS) setBootPlate(true);
      } else if (elapsed >= BOOT_PLATE_ETA_MS) {
        setBootPlate(true);
      } else {
        // Nothing new since the first file: a slow link, or just the browser decoding a burst. Look again later.
        delay = window.setTimeout(check, BOOT_PLATE_ETA_MS - elapsed);
      }
    };
    const onProgress = (p: number) => {
      progress = p;
      setBootProgress(p);
      if (first) {
        check();
        return;
      }
      first = { at: performance.now(), progress: p };
      delay = window.setTimeout(check, BOOT_PLATE_DELAY_MS);
    };
    EventBus.on(EV.bootProgress, onProgress);
    return () => {
      EventBus.off(EV.bootProgress, onProgress);
      window.clearTimeout(nothing);
      window.clearTimeout(delay);
    };
  }, [scene]);

  // EventBus + note input wiring.
  useEffect(() => {
    const input = getNoteInput();
    input.attachKeyboard();
    installDevHooks();
    const offStatus = input.onStatus((s, err) => {
      const was = prevMic.current;
      prevMic.current = s;
      setMic(s);
      setMicError(err);
      // The mic dropped out mid-fight (unplugged, another app took it): stop and say so.
      if (was === "on" && s === "error" && FIGHT_SCENES.has(sceneRef.current)) {
        setMicAlert("lost");
        setPaused(true);
        announce("The ear lost your microphone.");
      }
      if (s === "on") setMicAlert((a) => (a === "lost" ? "back" : a));
    });
    let toastTimer: number | undefined;
    // Banner the latest objective now (and announce it if it is new).
    const showObjective = () => {
      window.clearTimeout(objectiveTimer.current);
      objectiveTimer.current = undefined;
      const text = liveObjective.current;
      shownObjective.current = { text, at: performance.now() };
      setObjective(text);
      if (text && text !== lastAnnounced.current) {
        lastAnnounced.current = text;
        announce(text);
      }
    };
    // The objective changed: show it now, or at the end of the current banner's hold.
    const paceObjective = () => {
      const shown = shownObjective.current;
      if (shown && liveObjective.current === shown.text) {
        // Back to what is already up: nothing to wait for.
        window.clearTimeout(objectiveTimer.current);
        objectiveTimer.current = undefined;
        return;
      }
      const wait = shown ? shown.at + OBJECTIVE_HOLD_MS - performance.now() : 0;
      if (wait <= 0) showObjective();
      else if (objectiveTimer.current === undefined) objectiveTimer.current = window.setTimeout(showObjective, wait);
    };
    const handlers: [string, (...args: never[]) => void][] = [
      [
        EV.hud,
        (h: HudState) => {
          setHud(h);
          if (h.objective !== liveObjective.current) {
            liveObjective.current = h.objective;
            paceObjective();
          }
          const full = h.magic >= 100;
          if (full && !magicFull.current) announce(`Magic full: play ${h.superSymbol} for Happily Ever After.`);
          magicFull.current = full;
        },
      ],
      [
        EV.heard,
        (h: HeardEntry) => {
          recordPlay(h, sceneRef.current);
          setHeard((prev) => [...prev, h].slice(-4));
          if (h.hit) setRightHits((n) => n + 1);
          const lat = getNoteInput().latencyStats();
          setLatencyMs(lat.count >= 3 ? lat.median : null);
        },
      ],
      [EV.bossIntro, (on: boolean) => setBossIntro(on)],
      [EV.bossLoading, (on: boolean) => setBossLoading(on)],
      [
        EV.gameOver,
        (info: GameOverInfo) => {
          setGameOver(info);
          setLight(lightFor("End", info.level, info));
          // The heading is drawn on the canvas: say how it went (EndOverlay focuses the way on).
          announce(endAnnouncement(info, session.playMode));
          // The lute reads the run back: Gemini's advice once Tiger Data has the last plays, else built-in tips.
          const ended = endRun(info);
          if (!ended) return;
          const { runId, summary, stored } = ended;
          setCoach({ status: "loading", runId });
          void stored
            .then(() => requestCoach(runId, summary))
            .then((result) => setCoach((c) => (c?.runId === runId ? { status: "ready", runId, result, summary } : c)));
        },
      ],
      [
        EV.toast,
        (msg: string) => {
          setToast(msg);
          window.clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => setToast(null), 4000);
        },
      ],
    ];
    for (const [ev, fn] of handlers) EventBus.on(ev, fn);
    return () => {
      offStatus();
      for (const [ev, fn] of handlers) EventBus.off(ev, fn);
      window.clearTimeout(toastTimer);
      window.clearTimeout(objectiveTimer.current);
      session.paused = false;
      // Leaving /play: release the mic and close the game's audio.
      void disposeNoteInput();
      void gameAudio.close();
    };
  }, [announce, setPaused]);

  const jump = useCallback(
    (key: string, fresh = false) => {
      const game = phaserRef.current?.game;
      if (!game) return;
      if (fresh || !session.stats) session.stats = newStats();
      setPaused(false);
      setGameOver(null);
      goTo(game, key);
    },
    [setPaused],
  );

  /** Play level `index` (retry, next level, restart the journey), with fresh stats unless told otherwise. */
  const playLevel = useCallback(
    (index: number, fresh = true) => {
      session.level = index;
      jump(sceneFor(index), fresh);
    },
    [jump],
  );

  // Keys handled by React. Esc closes the top layer first: the book, then a
  // pause confirm, then the pause menu; on the song picker it goes back to the
  // title; in a fight it pauses. P toggles the pause in fights; ` the dev overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const fight = FIGHT_SCENES.has(scene);
      if (e.code === "Escape") {
        if (notes) setNotes(false);
        else if (book) setBook(false);
        else if (confirm) setConfirm(null);
        else if (paused) setPaused(false);
        else if (scene === "Boss" && bossIntro) {
          if (!bossLoading) jump("Title", true);
        } else if (fight) setPaused(true);
        else return;
        e.preventDefault();
      } else if (e.code === "KeyP" && fight && !bossIntro && !book) {
        e.preventDefault();
        setPaused(!session.paused);
      } else if (e.code === "Backquote") {
        setDev((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, book, notes, confirm, paused, bossIntro, bossLoading, setPaused, jump]);

  // Pause when the tab is hidden (so the boss song doesn't run away). Coming
  // back with the menu closed, make sure the game isn't left paused (a pause
  // can slip in during a level change and leave the scene frozen).
  useEffect(() => {
    const onVis = () => {
      // Dev only: window.__noAutoPause = true keeps playing in a hidden tab (screenshots, bots).
      if (process.env.NODE_ENV !== "production" && (window as unknown as { __noAutoPause?: boolean }).__noAutoPause) return;
      if (document.hidden && FIGHT_SCENES.has(scene) && !session.paused) setPaused(true);
      else if (!document.hidden && !session.paused) EventBus.emit(EV.setPaused, false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [scene, setPaused]);

  const onScene = useCallback(
    (s: Phaser.Scene) => {
      const key = s.scene.key;
      sceneRef.current = key;
      window.clearTimeout(objectiveTimer.current);
      objectiveTimer.current = undefined;
      liveObjective.current = undefined;
      shownObjective.current = null;
      setObjective(undefined);
      magicFull.current = false;
      setScene(key);
      setSceneSerial((n) => n + 1);
      setConfirm(null);
      if (key !== "End") setLight(lightFor(key, session.level));
      // Dev only: lets playtest scripts and the console inspect the game.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __game?: Phaser.Game }).__game = s.game;
      if (key !== "End") {
        setGameOver(null);
        setCoach(null);
        setNotes(false);
      }
      // The lute's run: goes on through each fight scene, and ends at the End screen or the title.
      if (FIGHT_SCENES.has(key)) beginLevel();
      if (key === "Title") abandonRun();
      if (key !== "Boss") {
        setBossIntro(false);
        setBossLoading(false);
      }
      if (!FIGHT_SCENES.has(key)) setHud(null);
      if (FIGHT_SCENES.has(key) || key === "Title") setHeard([]);
      if (FIGHT_SCENES.has(key)) {
        const lv = levelAt(session.level);
        announce(`${lv.id} ${lv.name}`);
        // Keyboard focus on the game, not on a menu button that just went away.
        frameRef.current?.focus({ preventScroll: true });
      }
    },
    [announce],
  );

  /** Start the journey at `level` (index into LEVELS; see levels.ts). */
  const start = async (mode: "mic" | "keyboard", level = 0) => {
    gameAudio.ensure(); // user gesture: unlock audio
    gameAudio.play("click");
    session.mode = mode;
    session.level = level;
    session.stats = newStats();
    if (mode === "mic") {
      try {
        await getNoteInput().startMic();
      } catch {
        return; // error shown on the title screen; keyboard still works
      }
    }
    EventBus.emit(EV.startGame, mode);
  };

  // Dev only: jump straight to any level from the console (playtest scripts).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __playLevel?: (i: number) => void };
    w.__playLevel = (i: number) => playLevel(i, true);
    return () => {
      delete w.__playLevel;
    };
  }, [playLevel]);

  const toggleMic = async () => {
    const input = getNoteInput();
    if (input.micOn) await input.stopMic();
    else {
      gameAudio.ensure();
      await input.startMic().catch(() => {});
    }
  };

  const chooseSong = (c: BossSongChoice) => {
    gameAudio.ensure();
    EventBus.emit(EV.bossSongChosen, c);
  };

  // The game canvas never re-renders with the HUD (10 updates a second).
  const phaserEl = useMemo(() => <PhaserGame ref={phaserRef} currentActiveScene={onScene} />, [onScene]);
  const menuScene = scene === "Title" || scene === "End";

  return (
    <main className="game-shell" data-type={STORYBOOK_TYPE ? "storybook" : "classic"}>
      <RotateCard />
      <div className="game-frame" ref={frameRef} tabIndex={-1}>
        {phaserEl}
        <div className="game-ui" data-light={light}>
          <div className="game-hud" inert={modalOpen} data-cinematic={hud?.cinematic ? "1" : undefined}>
            {scene === "Boot" && bootPlate && <BootPlate progress={bootProgress} />}
            {scene === "Title" && (
              <TitleOverlay onStart={start} onBook={() => setBook(true)} mic={mic} micError={micError} playMode={playMode} onPlayMode={setPlayMode} />
            )}
            {scene === "Tune" && (
              <TuneOverlay onDone={() => EventBus.emit(EV.tuneDone)} speakers={speakers} onSpeakers={setSpeakers} mic={mic} micError={micError} />
            )}
            {inFight && <Hud key={`hud-${sceneSerial}`} hud={hud} objective={objective} showPause={!bossIntro} onPause={() => setPaused(true)} />}
            {inFight && !bossIntro && <ChordHelper key={`helper-${sceneSerial}`} hud={hud} keyboard={mic !== "on"} legend={rightHits < LEGEND_HITS} />}
            {inFight && <Ear heard={heard} micOn={mic === "on"} micLost={micAlert === "lost"} playMode={playMode} latencyMs={latencyMs} />}
            {scene === "End" && gameOver && (
              <EndOverlay
                info={gameOver}
                playMode={playMode}
                practice={practice}
                onPractice={setPractice}
                onNext={() => playLevel(gameOver.level + 1)}
                onRetry={() => playLevel(gameOver.level)}
                onRestart={() => playLevel(0)}
                onTitle={() => jump("Title", true)}
              />
            )}
            {scene === "End" && gameOver && coach && (
              <div className="lute-slot">
                <LuteCard state={coach} onNotes={() => setNotes(true)} />
              </div>
            )}
          </div>
          {scene === "Boss" && bossIntro && (
            <BossPicker loading={bossLoading} playMode={playMode} inert={paused || book} onChoose={chooseSong} onBack={() => jump("Title", true)} />
          )}
          {paused && (
            <PauseMenu
              inert={book}
              returnFocus={frameRef}
              levelId={levelAt(session.level).id}
              playMode={playMode}
              practice={practice}
              onPractice={setPractice}
              onResume={() => setPaused(false)}
              onBook={() => setBook(true)}
              confirm={confirm}
              onConfirm={setConfirm}
              onRestart={() => playLevel(session.level)}
              onQuit={() => jump("Title", true)}
              mic={mic}
              micError={micError}
              micAlert={micAlert}
              onMic={toggleMic}
              speakers={speakers}
              onSpeakers={setSpeakers}
            />
          )}
          {book && <ChordBook playMode={playMode} practice={practice} onPractice={setPractice} onClose={() => setBook(false)} />}
          {notes && coach?.status === "ready" && <LuteNotes state={coach} onClose={() => setNotes(false)} />}
          {dev && <DevOverlay mic={mic} />}
          <div className="gm-toast plate" role="status" aria-live="polite">
            {toast ?? ""}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
      </div>
      <footer className="game-foot" inert={modalOpen}>
        {menuScene && (
          <>
            <Link href="/preview">Song Workshop</Link> · <Link href="/input-test">Input lab</Link> ·{" "}
          </>
        )}
        All art and sound made in code
      </footer>
    </main>
  );
}
