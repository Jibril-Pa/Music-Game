import Phaser from "phaser";
import { EventBus, onBus } from "../EventBus";
import { EV } from "../events";
import { GROUND_Y, burst, light, text } from "../fx";
import { levelAt, sceneFor } from "../levels";
import { session } from "../state";
import { actorTint, showWorld } from "../stage";
import { staticBackdrop } from "./worlds";

/** "Tune your lute" by the campfire. The tuner UI is React (TuneOverlay). */
export class Tune extends Phaser.Scene {
  constructor() {
    super("Tune");
  }

  create() {
    const world = levelAt(session.level).world;
    const in3d = showWorld(this, { world, night: true, kind: "menu", campfireX: 760 });
    light.tint = in3d ? actorTint() : 0xffffff;
    if (!in3d) staticBackdrop(this, world, true);
    const fire = this.add.image(760, GROUND_Y + 6, "campfire").setOrigin(0.5, 1).setDepth(5);
    this.tweens.add({ targets: fire, scaleY: 1.08, duration: 180, yoyo: true, repeat: -1 });
    // The fire's glow: faint rings that add up to a soft falloff (no hard-edged disc).
    for (const r of [200, 165, 130, 95, 60]) this.add.circle(760, GROUND_Y - 40, r, 0xffb35c, 0.035).setDepth(4);
    this.time.addEvent({ delay: 120, loop: true, callback: () => burst(this, 760, GROUND_Y - 60, { tint: [0xffb35c, 0xffe066], count: 1, speed: 60, gravityY: -160, scale: 0.4, lifespan: 900 }) });
    this.add.image(560, GROUND_Y, "hero").setOrigin(0.5, 1).setDepth(10);
    text(this, 640, 90, "Tune your lute", 54, "#ffe9a8").setDepth(20);
    this.cameras.main.fadeIn(400, 20, 12, 8);
    onBus(this, EV.tuneDone, this.onDone);
    EventBus.emit(EV.sceneReady, this);
  }

  private onDone() {
    this.cameras.main.fadeOut(400, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(sceneFor(session.level)));
  }
}
