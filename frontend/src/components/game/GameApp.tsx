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
import { EV, type BossSongChoice, type ComboProgress, type GameOverInfo, type HeardEntry, type HudState } from "@/game/events";
import { goTo } from "@/game/main";
import { PhaserGame, type IRefPhaserGame } from "@/game/PhaserGame";
import { newStats, session } from "@/game/state";
import { gameAudio } from "@/lib/game-audio/audio";
import { installDevHooks } from "@/lib/input/devHooks";
import { disposeNoteInput, getNoteInput, type MicStatus } from "@/lib/input/noteInput";
import DevOverlay from "./DevOverlay";
import { Ear, Hud } from "./Hud";
import { BossPicker, EndOverlay, PauseMenu, TitleOverlay, TuneOverlay } from "./Overlays";
import Spellbook from "./Spellbook";

const FIGHT_SCENES = new Set(["Level1", "Boss"]);

export default function GameApp() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [scene, setScene] = useState("Boot");
  const [hud, setHud] = useState<HudState | null>(null);
  const [heard, setHeard] = useState<HeardEntry[]>([]);
  const [progress, setProgress] = useState<ComboProgress>({ inputs: [], next: [] });
  const [fps, setFps] = useState(0);
  const [beat, setBeat] = useState(0);
  const [paused, setPausedState] = useState(false);
  const [spellbook, setSpellbook] = useState(false);
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
    if (!p) setSpellbook(false);
    EventBus.emit(EV.setPaused, p);
  }, []);

  const setPractice = useCallback((on: boolean) => {
    session.practice = on;
    setPracticeState(on);
  }, []);

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
      [EV.comboProgress, (p: ComboProgress) => setProgress(p)],
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

  // Pause when the tab is hidden (so the boss song doesn't run away).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && FIGHT_SCENES.has(scene) && !session.paused) setPaused(true);
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
    if (key === "Level1" || key === "Title") setHeard([]);
  }, []);

  const start = async (mode: "mic" | "keyboard") => {
    gameAudio.ensure(); // user gesture: unlock audio
    gameAudio.play("click");
    session.mode = mode;
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

  const jump = (key: string, fresh = false) => {
    const game = phaserRef.current?.game;
    if (!game) return;
    if (fresh || !session.stats) session.stats = newStats();
    setPaused(false);
    setGameOver(null);
    goTo(game, key);
  };

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
          {scene === "Title" && <TitleOverlay onStart={start} onSpellbook={() => setSpellbook(true)} mic={mic} micError={micError} />}
          {scene === "Tune" && <TuneOverlay onDone={() => EventBus.emit(EV.tuneDone)} />}
          {inFight && <Hud hud={hud} beat={beat} />}
          {(inFight || scene === "Tune") && <Ear heard={heard} progress={progress} micOn={mic === "on"} />}
          {inFight && (
            <div className="hud-br">
              {mic === "on" ? "🎸 mic on" : "⌨ keyboard"} · <kbd>Esc</kbd> pause · <kbd>`</kbd> dev
            </div>
          )}
          {scene === "Boss" && bossIntro && <BossPicker loading={bossLoading} onChoose={chooseSong} />}
          {scene === "End" && gameOver && (
            <EndOverlay info={gameOver} onAgain={() => jump("Level1", true)} onBoss={() => jump("Boss")} onTitle={() => jump("Title", true)} />
          )}
          {paused && !spellbook && (
            <PauseMenu
              practice={practice}
              onPractice={setPractice}
              onResume={() => setPaused(false)}
              onSpellbook={() => setSpellbook(true)}
              onRestart={() => jump(scene, scene === "Level1")}
              onQuit={() => jump("Title", true)}
              mic={mic}
              onMic={toggleMic}
            />
          )}
          {spellbook && <Spellbook practice={practice} onPractice={setPractice} onClose={() => setSpellbook(false)} />}
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
