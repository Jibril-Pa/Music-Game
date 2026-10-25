import Phaser from "phaser";
import { PAPER_PAD } from "../art-kit";
import { GROUND_Y, restoreTint } from "../fx";

const WALK = ["hero_walk1", "hero_walk2", "hero_walk3", "hero_walk4"];

/** The wandering bard. Movement on the keyboard; attacks come from notes. */
export class Hero extends Phaser.Physics.Arcade.Sprite {
  hp = 100;
  maxHp = 100;
  magic = 0;
  facing: 1 | -1 = 1;
  shieldUntil = 0;
  invulnUntil = 0;
  actionUntil = 0;
  hurtUntil = 0;
  private walkPhase = 0;
  readonly shadow: Phaser.GameObjects.Image;
  readonly shieldFx: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, maxHp = 100) {
    super(scene, x, GROUND_Y, "hero");
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.maxHp = this.hp = maxHp;
    this.setOrigin(0.5, 1).setDepth(20);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(46, 108).setOffset(30 + PAPER_PAD, 30 + PAPER_PAD);
    body.setMaxVelocityY(1400);
    this.shadow = scene.add.image(x, GROUND_Y + 4, "shadow").setDepth(5).setScale(0.8, 1);
    this.shieldFx = scene.add.image(x, GROUND_Y - 70, "shield").setDepth(25).setVisible(false);
    restoreTint(this);
  }

  get body2(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get onGround(): boolean {
    return this.body2.blocked.down || this.body2.touching.down;
  }

  isShielded(now: number): boolean {
    return now < this.shieldUntil;
  }

  addMagic(n: number) {
    this.magic = Phaser.Math.Clamp(this.magic + n, 0, 100);
  }

  /** Called every frame by the scene. */
  tick(now: number, dtMs: number, moving: boolean) {
    this.setFlipX(this.facing < 0);
    if (now < this.hurtUntil) {
      this.setTexture("hero_hurt");
      this.setAlpha(Math.floor(now / 60) % 2 ? 0.45 : 1);
    } else {
      this.setAlpha(now < this.invulnUntil ? (Math.floor(now / 90) % 2 ? 0.6 : 1) : 1);
      if (now < this.actionUntil) {
        // Strum down, then up.
        this.setTexture(this.actionUntil - now > 110 ? "hero_strum1" : "hero_strum2");
      } else if (moving && this.onGround) {
        this.walkPhase += dtMs;
        this.setTexture(WALK[Math.floor(this.walkPhase / 115) % WALK.length]);
      } else this.setTexture("hero");
    }
    // idle bob / squash
    const bob = this.onGround && !moving && now >= this.actionUntil ? Math.sin(now / 260) * 0.02 : 0;
    this.setScale(1, 1 + bob);
    this.shadow.setPosition(this.x, GROUND_Y + 4);
    this.shadow.setScale(0.8 * Math.max(0.4, 1 - (GROUND_Y - this.y) / 400), 1);
    const shielded = this.isShielded(now);
    this.shieldFx.setVisible(shielded).setPosition(this.x, this.y - 66);
    if (shielded) {
      const left = this.shieldUntil - now;
      this.shieldFx.setAlpha(left < 300 ? (Math.floor(now / 60) % 2 ? 0.3 : 0.8) : 0.85 + Math.sin(now / 80) * 0.1);
      this.shieldFx.setScale(1 + Math.sin(now / 120) * 0.03);
    }
  }

  destroyAll() {
    this.shadow.destroy();
    this.shieldFx.destroy();
    this.destroy();
  }
}
