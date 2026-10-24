import { Events } from "phaser";
import type Phaser from "phaser";

// Used to emit events between React components and Phaser scenes
// (the pattern from the official phaserjs/template-nextjs).
// https://newdocs.phaser.io/docs/3.90.0/Phaser.Events.EventEmitter
export const EventBus = new Events.EventEmitter();

/**
 * Listen on the EventBus for as long as `scene` lives: removed on shutdown
 * AND on destroy (game.destroy() only fires destroy, e.g. React StrictMode
 * mounting the game twice in development).
 */
export function onBus(scene: Phaser.Scene, event: string, fn: (...args: never[]) => void) {
  EventBus.on(event, fn, scene);
  const off = () => EventBus.off(event, fn, scene);
  scene.events.once("shutdown", off);
  scene.events.once("destroy", off);
}
