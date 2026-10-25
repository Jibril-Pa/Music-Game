"use client";

/**
 * /play: Phaser game + React HUD and menus, talking over the EventBus
 * (pattern from phaserjs/template-nextjs). Owns the note input: the mic is
 * released when this unmounts (leaving /play).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import { EventBus } from "@/game/EventBus";
import { EV, type BossSongChoice, type GameOverInfo, type HeardEntry, type HudState } from "@/game/events";
import { sceneFor } from "@/game/levels";
import { goTo } from "@/game/main";
import { PhaserGame, type IRefPhaserGame } from "@/game/PhaserGame";
import { newStats, session } from "@/game/state";
import { gameAudio } from "@/lib/game-audio/audio";
import { installDevHooks } from "@/lib/input/devHooks";
import { disposeNoteInput, getNoteInput, type MicStatus } from "@/lib/input/noteInput";
import DevOverlay from "./DevOverlay";
import { ChordHelper, Ear, Hud } from "./Hud";
import { BossPicker, EndOverlay, PauseMenu, TitleOverlay, TuneOverlay } from "./Overlays";
import ChordBook from "./ChordBook";
import type { PlayMode } from "@/lib/combat/spells";

const FIGHT_SCENES = new Set(["Journey", "Boss"]);

const SPEAKERS_KEY = "traveling-bard:laptop-speakers";

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
  const [scene, setScene] = useState("Boot");
  const [hud, setHud] = useState<HudState | null>(null);
  const [heard, setHeard] = useState<HeardEntry[]>([]);
  const [fps, setFps] = useState(0);
  const [beat, setBeat] = useState(0);
  const [paused, setPausedState] = useState(false);
  const [book, setBook] = useState(false);
  const [playMode, setPlayModeState] = useState<PlayMode>("chords");
  const [dev, setDev] = useState(false);
  const [practice, setPracticeState] = useState(false);
  const [mic, setMic] = useState<MicStatus>("off");
  const [micError, setMicError] = useState<string | undefined>();
  const [bossIntro, setBossIntro] = useState(false);
  const [bossLoading, setBossLoading] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const inFight = FIGHT_SCENES.has(scene);

  const setPaused = useCallback((p: boolean) => {
    session.paused = p;
    setPausedState(p);
    if (!p) setBook(false);
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

  // EventBus + note input wiring.
  useEffect(() => {
    const input = getNoteInput();
    input.attachKeyboard();
    installDevHooks();
    const offStatus = input.onStatus((s, err) => {
      setMic(s);
      setMicError(err);
    });
    let toastTimer: number | undefined;
    const handlers: [string, (...args: never[]) => void][] = [
      [EV.hud, (h: HudState) => setHud(h)],
      [EV.heard, (h: HeardEntry) => setHeard((prev) => [h, ...prev].slice(0, 6))],
      [EV.fps, (f: number) => setFps(f)],
      [EV.beat, (b: number) => setBeat(b)],
      [EV.bossIntro, (on: boolean) => setBossIntro(on)],
      [EV.bossLoading, (on: boolean) => setBossLoading(on)],
      [EV.gameOver, (info: GameOverInfo) => setGameOver(info)],
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
      session.paused = false;
      // Leaving /play: release the mic and close the game's audio.
      void disposeNoteInput();
      void gameAudio.close();
    };
  }, []);

  // Keys handled by React: pause and the dev overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.code === "Escape" || e.code === "KeyP") && FIGHT_SCENES.has(scene) && !bossIntro) {
        e.preventDefault();
        setPaused(!session.paused);
      } else if (e.code === "Backquote") {
        setDev((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, bossIntro, setPaused]);

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

  const onScene = useCallback((s: Phaser.Scene) => {
    const key = s.scene.key;
    setScene(key);
    // Dev only: lets playtest scripts and the console inspect the game.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __game?: Phaser.Game }).__game = s.game;
    if (key !== "End") setGameOver(null);
    if (key !== "Boss") {
      setBossIntro(false);
      setBossLoading(false);
    }
    if (!FIGHT_SCENES.has(key)) setHud(null);
    if (key === "Journey" || key === "Title") setHeard([]);
  }, []);

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

  /** Play level `index` (retry, next world, restart the journey). */
  const playLevel = useCallback(
    (index: number, fresh = false) => {
      session.level = index;
      jump(sceneFor(index), fresh);
    },
    [jump],
  );

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

  return (
    <div className="game-shell">
      <div className="game-frame">
        <PhaserGame ref={phaserRef} currentActiveScene={onScene} />
        <div className="game-ui">
          {scene === "Title" && (
            <TitleOverlay onStart={start} onBook={() => setBook(true)} mic={mic} micError={micError} playMode={playMode} onPlayMode={setPlayMode} />
          )}
          {scene === "Tune" && <TuneOverlay onDone={() => EventBus.emit(EV.tuneDone)} speakers={speakers} onSpeakers={setSpeakers} />}
          {inFight && <Hud hud={hud} beat={beat} />}
          {inFight && !bossIntro && <ChordHelper hud={hud} keyboard={mic !== "on"} />}
          {(inFight || scene === "Tune") && <Ear heard={heard} micOn={mic === "on"} />}
          {inFight && (
            <div className="hud-br">
              {mic === "on" ? "🎸 mic on" : "⌨ keyboard"} · <kbd>Esc</kbd> pause · <kbd>`</kbd> dev
            </div>
          )}
          {scene === "Boss" && bossIntro && <BossPicker loading={bossLoading} onChoose={chooseSong} />}
          {scene === "End" && gameOver && (
            <EndOverlay
              info={gameOver}
              onNext={() => playLevel(gameOver.level + 1)}
              onRetry={() => playLevel(gameOver.level)}
              onRestart={() => playLevel(0, true)}
              onTitle={() => jump("Title", true)}
            />
          )}
          {paused && !book && (
            <PauseMenu
              practice={practice}
              onPractice={setPractice}
              onResume={() => setPaused(false)}
              onBook={() => setBook(true)}
              onRestart={() => playLevel(session.level, scene === "Journey")}
              onQuit={() => jump("Title", true)}
              mic={mic}
              onMic={toggleMic}
              speakers={speakers}
              onSpeakers={setSpeakers}
            />
          )}
          {book && <ChordBook playMode={playMode} practice={practice} onPractice={setPractice} onClose={() => setBook(false)} />}
          {dev && <DevOverlay fps={fps} mic={mic} />}
          {toast && <div className="gm-toast">{toast}</div>}
        </div>
      </div>
      <p className="game-foot muted small">
        <Link href="/input-test">input test</Link> · <Link href="/preview">song pipeline</Link> · all art and sound made in code
      </p>
    </div>
  );
}
