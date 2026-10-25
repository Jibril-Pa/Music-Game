import Phaser from "phaser";
import { EventBus } from "../EventBus";
import { EV } from "../events";
import { GROUND_Y, burst, text } from "../fx";
import { WORLDS, isFinalLevel, levelAt } from "../levels";
import { newStats, session } from "../state";
import { staticBackdrop } from "./worlds";

/** After a boss (victory) or any defeat. Buttons are React (EndOverlay). */
export class End extends Phaser.Scene {
  constructor() {
    super("End");
  }

  create(data: { victory: boolean; from: string; level: number }) {
    const level = data.level ?? session.level;
    const lv = levelAt(level);
    staticBackdrop(this, lv.world, !data.victory);
    const stats = session.stats ?? newStats();
    stats.endedAt = performance.now();
    if (data.victory) {
      const final = isFinalLevel(level);
      this.add.image(640, GROUND_Y, "hero").setOrigin(0.5, 1).setDepth(10).setScale(1.4);
      if (final) {
        this.add.image(760, GROUND_Y - 150, "hourglass").setDepth(11).setScale(1.2);
        text(this, 640, 130, "Happily Ever After!", 84, "#ffe066").setDepth(20);
        text(this, 640, 210, "The Hourglass of Ages is whole, and every tale is back in its time.", 26, "#fff6dc").setDepth(20);
      } else {
        const next = levelAt(level + 1);
        const portal = this.add.image(1000, GROUND_Y - 170, "portal").setDepth(6);
        this.tweens.add({ targets: portal, angle: 360, duration: 5000, repeat: -1 });
        text(this, 640, 130, `${WORLDS[lv.world].era}: saved!`, 64, "#ffe066").setDepth(20);
        text(this, 640, 205, `...but the wolf escaped to ${WORLDS[next.world].era}.`, 28, "#fff6dc").setDepth(20);
      }
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
    EventBus.emit(EV.gameOver, { victory: data.victory, stats, scene: data.from, level });
  }
}
