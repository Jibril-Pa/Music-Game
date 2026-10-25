import Phaser from "phaser";
import { GROUND_Y, flashSprite, restoreTint } from "../fx";

export type WolfState = "idle" | "retreat" | "stalk" | "windup" | "recover" | "huff" | "blow" | "stagger" | "defeated";

/**
 * The boss of every world: the Big Bad Wolf (in his desert and mecha forms
 * later on). Not physics-driven: the scene moves him with tweens and AI.
 */
export class BigBadWolf extends Phaser.GameObjects.Sprite {
  readonly maxHp: number;
  hp: number;
  state: WolfState = "idle";
  stateUntil = 0;
  nextSwipeAt = 0;
  readonly shadow: Phaser.GameObjects.Image;
  readonly hitHalfWidth = 95;
  readonly hitHeight = 270;

  /** Texture prefix: "bigwolf", "sandwolf", "mechawolf". */
  readonly look: string;

  constructor(scene: Phaser.Scene, x: number, hp: number, look = "bigwolf") {
    super(scene, x, GROUND_Y, look);
    this.look = look;
    this.maxHp = this.hp = hp;
    scene.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(16).setFlipX(true);
    this.shadow = scene.add.image(x, GROUND_Y + 6, "shadow").setDepth(5).setScale(2.4, 1.4);
    restoreTint(this);
  }

  get alive(): boolean {
    return this.hp > 0 && this.state !== "defeated";
  }

  /** Mouth position (attacks come from here). */
  /** Show a pose: "" (idle), "huff" or "hurt". */
  pose(p: "" | "huff" | "hurt") {
    this.setTexture(p ? `${this.look}_${p}` : this.look);
  }

  get mouth(): { x: number; y: number } {
    return { x: this.x + (this.flipX ? -110 : 110), y: this.y - 220 };
  }

  takeHit(amount: number, dir: number, knockback: number, _launch: number, now: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    flashSprite(this.scene, this, 0xffffff, 80);
    const push = Math.min(36, knockback / 15);
    this.x = Phaser.Math.Clamp(this.x + dir * push, 640, 1180);
    if (amount >= 30 && this.state !== "huff" && this.state !== "blow") {
      this.state = "stagger";
      this.stateUntil = now + 380;
      this.setTexture(`${this.look}_hurt`);
    }
    return this.hp <= 0;
  }

  tickVisual(now: number) {
    this.shadow.setPosition(this.x, GROUND_Y + 6);
    if (this.state === "idle" || this.state === "stalk" || this.state === "retreat") {
      this.setScale(1, 1 + Math.sin(now / 230) * 0.015);
    }
  }

  destroyAll() {
    this.shadow.destroy();
    this.destroy();
  }
}
