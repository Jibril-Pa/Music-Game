import Phaser from "phaser";
import { LOGICAL_H, LOGICAL_W, enableHiDpi } from "./hidpi";
import { Boot } from "./scenes/Boot";
import { Boss } from "./scenes/Boss";
import { End } from "./scenes/End";
import { Journey } from "./scenes/Journey";
import { Title } from "./scenes/Title";
import { Tune } from "./scenes/Tune";

/** The game's LOGICAL size: every scene works in these pixels, whatever the screen's density (hidpi.ts). */
export const GAME_WIDTH = LOGICAL_W;
export const GAME_HEIGHT = LOGICAL_H;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // Transparent: the 3D stage (stage/) is drawn on a canvas behind this one.
  transparent: true,
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
  callbacks: {
    // Device-resolution backbuffer behind the logical 1280x720 (crisp on high-DPI screens).
    postBoot: (game) => {
      const off = enableHiDpi(game);
      game.events.once(Phaser.Core.Events.DESTROY, off);
    },
  },
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
