import Phaser from "phaser";
import { EventBus, onBus } from "../EventBus";
import { EV } from "../events";
import { FONT, GROUND_Y, burst, light } from "../fx";
import { sceneFor } from "../levels";
import { session } from "../state";
import { actorTint, showWorld } from "../stage";
import { staticBackdrop } from "./worlds";

/** Title screen: the wolf escapes into a time portal with the Hourglass. The buttons are React (TitleOverlay). */
export class Title extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create() {
    // Menu on the left, the chase on the right: the bard, the wolf with the Hourglass, the portal.
    const in3d = showWorld(this, { world: "forest", night: false, kind: "menu", portalX: 1150 });
    light.tint = in3d ? actorTint() : 0xffffff;
    if (!in3d) {
      staticBackdrop(this, "forest");
      const portal = this.add.image(1150, GROUND_Y - 175, "portal").setDepth(6).setAlpha(0.9);
      this.tweens.add({ targets: portal, angle: 360, duration: 6000, repeat: -1 });
      this.tweens.add({ targets: portal, scale: 1.06, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
    const bard = this.add.image(800, GROUND_Y, "hero").setOrigin(0.5, 1).setDepth(10).setScale(1.3);
    this.add.image(800, GROUND_Y + 4, "shadow").setDepth(5);
    this.tweens.add({ targets: bard, scaleY: 1.33, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    const wolf = this.add.image(1000, GROUND_Y, "wolf").setOrigin(0.5, 1).setDepth(9).setAlpha(0.95);
    const glass = this.add.image(1045, GROUND_Y - 70, "hourglass").setDepth(11).setScale(0.45);
    this.tweens.add({ targets: [wolf, glass], y: "-=14", duration: 380, yoyo: true, repeat: -1, ease: "Sine.Out" });
    this.add
      .text(640, 112, "The Traveling Bard", { fontFamily: FONT, fontSize: "72px", fontStyle: "bold", color: "#ffe9a8", stroke: "#2b1a12", strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(20);
    this.add
      .text(640, 186, "a time-traveling fairy tale you play with a real guitar", { fontFamily: FONT, fontSize: "26px", fontStyle: "italic", color: "#fff6dc", stroke: "#2b1a12", strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(20);
    this.time.addEvent({ delay: 400, loop: true, callback: () => burst(this, 1150 + Phaser.Math.Between(-80, 80), GROUND_Y - 175 + Phaser.Math.Between(-120, 120), { tint: [0xb784ff, 0x7ff3ff, 0xffffff], count: 2, speed: 80, gravityY: -60, scale: 0.6 }) });
    onBus(this, EV.startGame, this.onStart as (...a: never[]) => void);
    EventBus.emit(EV.sceneReady, this);
  }

  private onStart(mode: "mic" | "keyboard") {
    this.cameras.main.fadeOut(400, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(mode === "mic" ? "Tune" : sceneFor(session.level)));
  }
}
