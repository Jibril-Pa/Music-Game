import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Boss } from "./scenes/Boss";
import { End } from "./scenes/End";
import { Journey } from "./scenes/Journey";
import { Title } from "./scenes/Title";
import { Tune } from "./scenes/Tune";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#1d2a1f",
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 1800 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60 },
  render: { antialias: true, roundPixels: false },
  // Keyboard notes (Z X C V B, 1-4) are read by NoteInput on window; let them through.
  input: { keyboard: { capture: [] } },
  // All sound is our own Web Audio (lib/game-audio); Phaser's sound manager
  // would open a second AudioContext for nothing.
  audio: { noAudio: true },
  scene: [Boot, Title, Tune, Journey, Boss, End],
};

export default function StartGame(parent: string) {
  return new Phaser.Game({ ...config, parent });
}

/** Stop whatever is running and start `key` (React menus: restart, quit). */
export function goTo(game: Phaser.Game, key: string, data?: object) {
  for (const s of game.scene.getScenes(false)) {
    if (s.scene.key !== key && (s.scene.isActive() || s.scene.isPaused())) s.scene.stop();
  }
  game.scene.start(key, data);
}
