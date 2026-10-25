"use client";

// React <-> Phaser bridge, following the official phaserjs/template-nextjs.
// One change: the template uses the Pages Router; in the App Router React
// StrictMode mounts effects twice in development, so the game is created on
// the next tick (the first, throwaway mount never builds one) and its canvas
// is removed on unmount.
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import type Phaser from "phaser";
import StartGame from "./main";
import { mountStage, unmountStage } from "./stage";
import { EventBus } from "./EventBus";
import { EV } from "./events";

export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref) {
  const game = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    let created: Phaser.Game | null = null;
    const timer = window.setTimeout(() => {
      created = StartGame("game-container");
      game.current = created;
      // Dev only: scripts can drive the game even before the first scene is ready.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __game?: Phaser.Game }).__game = created;
      // The 2.5D stage: a 3D world on a canvas behind Phaser's (see stage/).
      const container = document.getElementById("game-container");
      if (container) mountStage(created, container);
      if (typeof ref === "function") ref({ game: created, scene: null });
      else if (ref) ref.current = { game: created, scene: null };
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (created) {
        unmountStage(created);
        const canvas = created.canvas;
        created.destroy(true);
        canvas?.remove();
      }
      game.current = null;
    };
  }, [ref]);

  useEffect(() => {
    const onReady = (scene_instance: Phaser.Scene) => {
      if (currentActiveScene) currentActiveScene(scene_instance);
      if (typeof ref === "function") ref({ game: game.current, scene: scene_instance });
      else if (ref) ref.current = { game: game.current, scene: scene_instance };
    };
    EventBus.on(EV.sceneReady, onReady);
    return () => {
      EventBus.removeListener(EV.sceneReady, onReady);
    };
  }, [currentActiveScene, ref]);

  return <div id="game-container" aria-hidden="true" />;
});
