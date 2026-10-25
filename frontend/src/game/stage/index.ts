/**
 * The 2.5D stage as seen by the game: mounted next to Phaser's canvas,
 * rendered right after every Phaser frame with the current scene's camera.
 * Scenes call showWorld() in create(); if 3D isn't available it returns false
 * and the scene draws its 2D backdrop instead.
 */

import type Phaser from "phaser";
import { ensureFallbackArt } from "../art-pipeline";
import type { WorldSpec } from "./scaffold";
import { Stage3D } from "./Stage3D";
import { buildWorld3d } from "./worlds3d";

export type { WorldSpec } from "./scaffold";

let stage: Stage3D | null = null;
let cam: Phaser.Cameras.Scene2D.Camera | null = null;

function tick() {
  if (!stage) return;
  if (cam) {
    const shake = cam.shakeEffect as unknown as { isRunning: boolean; _offsetX: number; _offsetY: number };
    stage.setView({
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      zoom: cam.zoom,
      shakeX: shake.isRunning ? shake._offsetX * cam.zoom : 0,
      shakeY: shake.isRunning ? shake._offsetY * cam.zoom : 0,
    });
  }
  stage.render();
}

/** Create the 3D canvas behind Phaser's (call once the game exists). */
export function mountStage(game: Phaser.Game, container: HTMLElement): boolean {
  unmountStage(game);
  // Dev only: ?no3d tries the game the way it runs without WebGL 3D (2D backdrops).
  if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("no3d")) return false;
  try {
    stage = new Stage3D(container);
  } catch (err) {
    console.warn("[stage] 3D is not available here; using 2D backdrops", err);
    stage = null;
    return false;
  }
  game.events.on("postrender", tick);
  // Dev only: lets the console and playtest scripts inspect / time the 3D stage.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __stage?: Stage3D }).__stage = stage;
  return true;
}

export function unmountStage(game?: Phaser.Game) {
  game?.events.off("postrender", tick);
  stage?.dispose();
  stage = null;
  cam = null;
}

/** Show a 3D world behind `scene` and follow its camera. False = no 3D: draw 2D instead. */
export function showWorld(scene: Phaser.Scene, spec: WorldSpec): boolean {
  if (!stage) {
    ensureFallbackArt(scene); // the 2D backdrops and scenery are drawn on first use
    return false;
  }
  try {
    stage.setWorld(JSON.stringify(spec), () => buildWorld3d(spec));
  } catch (err) {
    console.warn("[stage] couldn't build the 3D world; using 2D", err);
    ensureFallbackArt(scene);
    return false;
  }
  const c = scene.cameras.main;
  cam = c;
  scene.events.once("shutdown", () => {
    if (cam === c) cam = null;
  });
  return true;
}

/** Light colour to tint the 2D characters with, so they sit in the world's light. */
export function actorTint(): number {
  return stage?.actorTint ?? 0xffffff;
}

export function has3d(): boolean {
  return !!stage;
}
