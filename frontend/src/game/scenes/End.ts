import Phaser from "phaser";
import { EventBus } from "../EventBus";
import { EV } from "../events";
import { GROUND_Y, burst, text } from "../fx";
import { newStats, session } from "../state";
import { forestBackdrop } from "./backdrop";

/** Victory / defeat. Buttons are React (EndOverlay). */
export class End extends Phaser.Scene {
  constructor() {
    super("End");
  }

  create(data: { victory: boolean; from: string }) {
    forestBackdrop(this, !data.victory);
    const stats = session.stats ?? newStats();
    stats.endedAt = performance.now();
    if (data.victory) {
      this.add.image(640, GROUND_Y, "hero").setOrigin(0.5, 1).setDepth(10).setScale(1.4);
      text(this, 640, 140, "Victory!", 90, "#ffe066").setDepth(20);
      text(this, 640, 220, "The forest is safe, and the pigs can sleep soundly.", 28, "#fff6dc").setDepth(20);
      this.time.addEvent({
        delay: 300,
        loop: true,
        callback: () => burst(this, Phaser.Math.Between(150, 1130), Phaser.Math.Between(100, 350), { tint: [0xffe066, 0xff9ff3, 0x8fe36a, 0x58c7ff], count: 14, speed: 260 }),
      });
    } else {
      const h = this.add.image(640, GROUND_Y, "hero").setOrigin(0.5, 1).setDepth(10).setAngle(-80);
      h.y += 10;
      text(this, 640, 150, "The tale is not over...", 64, "#ffd6a0").setDepth(20);
      text(this, 640, 220, "Every bard misses a note sometimes. Try again!", 28, "#fff6dc").setDepth(20);
    }
    this.cameras.main.fadeIn(500, 20, 12, 8);
    EventBus.emit(EV.sceneReady, this);
    EventBus.emit(EV.gameOver, { victory: data.victory, stats, scene: data.from });
  }
}
