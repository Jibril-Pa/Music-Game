import Phaser from "phaser";
import { EventBus, onBus } from "../EventBus";
import { EV } from "../events";
import { FONT, GROUND_Y, burst } from "../fx";
import { forestBackdrop } from "./backdrop";

/** Title screen. The buttons are React (see TitleOverlay). */
export class Title extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create() {
    forestBackdrop(this);
    const bard = this.add.image(560, GROUND_Y, "hero").setOrigin(0.5, 1).setDepth(10).setScale(1.3);
    this.add.image(560, GROUND_Y + 4, "shadow").setDepth(5);
    this.tweens.add({ targets: bard, scaleY: 1.33, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    this.add.image(780, GROUND_Y, "wolf").setOrigin(0.5, 1).setDepth(9).setFlipX(true).setAlpha(0.95);
    this.add
      .text(640, 120, "The Bard of the Enchanted Forest", { fontFamily: FONT, fontSize: "64px", fontStyle: "bold", color: "#ffe9a8", stroke: "#2b1a12", strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(20);
    this.add
      .text(640, 190, "a fairy-tale fighting game you play with a real guitar", { fontFamily: FONT, fontSize: "26px", fontStyle: "italic", color: "#fff6dc", stroke: "#2b1a12", strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(20);
    this.time.addEvent({ delay: 400, loop: true, callback: () => burst(this, 600 + Phaser.Math.Between(-30, 60), GROUND_Y - 110, { tint: [0xffe066, 0xffffff], count: 2, speed: 80, gravityY: -120, scale: 0.6 }) });
    onBus(this, EV.startGame, this.onStart as (...a: never[]) => void);
    EventBus.emit(EV.sceneReady, this);
  }

  private onStart(mode: "mic" | "keyboard") {
    this.cameras.main.fadeOut(400, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(mode === "mic" ? "Tune" : "Level1"));
  }
}
