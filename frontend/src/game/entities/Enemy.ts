import Phaser from "phaser";
import { GROUND_Y, flashSprite } from "../fx";

export type EnemyKind = "wolf" | "goblin" | "troll" | "witch";

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  /** Melee reach (px) or preferred throwing distance for ranged. */
  range: number;
  windupMs: number;
  cooldownMs: number;
  texture: string;
  windupTexture?: string;
  body: [number, number];
  /** Heavier enemies fly less far. */
  weight: number;
  ranged?: boolean;
  /** Hit stun duration. */
  stunMs: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  wolf: { name: "Forest Wolf", hp: 40, speed: 200, damage: 7, range: 100, windupMs: 420, cooldownMs: 1400, texture: "wolf", windupTexture: "wolf_bite", body: [100, 60], weight: 1, stunMs: 280 },
  goblin: { name: "Goblin", hp: 30, speed: 160, damage: 5, range: 90, windupMs: 380, cooldownMs: 1200, texture: "goblin", body: [56, 84], weight: 0.9, stunMs: 300 },
  troll: { name: "Bridge Troll", hp: 200, speed: 85, damage: 14, range: 160, windupMs: 800, cooldownMs: 2200, texture: "troll", windupTexture: "troll_raise", body: [120, 170], weight: 3, stunMs: 180 },
  witch: { name: "Gingerbread Witch", hp: 90, speed: 130, damage: 8, range: 420, windupMs: 650, cooldownMs: 2300, texture: "witch", body: [64, 128], weight: 1.2, ranged: true, stunMs: 260 },
};

export type EnemyState = "spawning" | "approach" | "windup" | "recover" | "hurt" | "dead";

export interface EnemyHost {
  hero: Phaser.GameObjects.Sprite & { x: number; y: number };
  heroHurt(amount: number, fromX: number, source: string): void;
  throwCandy(from: Enemy, targetX: number): void;
  sfx(name: string): void;
  isFrozen(): boolean;
}

let nextId = 1;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly id = nextId++;
  readonly def: EnemyDef;
  hp: number;
  state: EnemyState = "approach";
  /** Has walked into the arena (then it is kept inside). */
  entered = false;
  stateUntil = 0;
  nextAttackAt = 0;
  private hpBar: Phaser.GameObjects.Graphics;
  readonly shadow: Phaser.GameObjects.Image;
  /** Spread enemies out instead of stacking on one spot. */
  private slot = Phaser.Math.Between(-30, 30);
  private hitBy = new Set<number>();

  constructor(
    scene: Phaser.Scene,
    readonly kind: EnemyKind,
    x: number,
    private readonly host: EnemyHost,
  ) {
    super(scene, x, GROUND_Y, ENEMY_DEFS[kind].texture);
    this.def = ENEMY_DEFS[kind];
    this.hp = this.def.hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(18);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.def.body[0], this.def.body[1]).setOffset((this.width - this.def.body[0]) / 2, this.height - this.def.body[1]);
    this.shadow = scene.add.image(x, GROUND_Y + 4, "shadow").setDepth(5).setScale((this.def.body[0] / 100) * 1.1, 1);
    this.hpBar = scene.add.graphics().setDepth(40);
    this.nextAttackAt = scene.time.now + 600 + Math.random() * 600;
  }

  get alive(): boolean {
    return this.state !== "dead";
  }

  get hitHalfWidth(): number {
    return this.def.body[0] / 2;
  }

  get hitHeight(): number {
    return this.def.body[1];
  }

  get body2(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  /** Each projectile id may hit once. */
  hitOnceBy(id: number): boolean {
    if (this.hitBy.has(id)) return false;
    this.hitBy.add(id);
    return true;
  }

  takeHit(amount: number, dir: number, knockback: number, launch: number, now: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    flashSprite(this.scene, this, 0xffffff, 70);
    const w = this.def.weight;
    this.setVelocityX((dir * knockback) / w);
    if (launch > 0) this.setVelocityY(-launch / Math.sqrt(w));
    if (this.hp <= 0) {
      this.die(dir);
      return true;
    }
    // Light hits (a lone jab) don't stop an attack that's already winding up:
    // spamming single notes gets punished, combos break through.
    const heavy = amount >= 15;
    if (this.state === "windup" && !heavy) return false;
    this.state = "hurt";
    this.stateUntil = now + (heavy ? this.def.stunMs : 150);
    this.setTexture(this.def.texture);
    this.clearTint();
    return false;
  }

  private die(dir: number) {
    this.state = "dead";
    this.hpBar.clear();
    this.setVelocity(dir * 380, -520);
    this.body2.checkCollision.none = true;
    this.scene.tweens.add({ targets: this, angle: dir * 200, alpha: 0, duration: 750, ease: "Cubic.In" });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 400 });
    this.scene.time.delayedCall(800, () => {
      this.shadow.destroy();
      this.hpBar.destroy();
      this.destroy();
    });
  }

  tick(now: number) {
    if (!this.alive) return;
    const body = this.body2;
    const grounded = body.blocked.down || body.touching.down;
    this.shadow.setPosition(this.x, GROUND_Y + 4);
    this.drawHp();
    if (this.host.isFrozen()) return;

    const hero = this.host.hero;
    const dx = hero.x - this.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || 1;

    if (this.state === "hurt") {
      if (grounded) this.setVelocityX(this.body2.velocity.x * 0.85);
      if (now >= this.stateUntil && grounded) {
        this.state = "approach";
        this.nextAttackAt = Math.max(this.nextAttackAt, now + 350);
      }
      return;
    }
    this.setFlipX(dx < 0);
    if (!grounded) return;

    if (this.state === "windup") {
      this.setVelocityX(0);
      // Telegraph: glow orange while winding up.
      this.setTint(Math.floor(now / 80) % 2 ? 0xffb066 : 0xffffff);
      if (now >= this.stateUntil) {
        this.clearTint();
        this.attack(dir, dist);
        this.state = "recover";
        this.stateUntil = now + 350;
        this.nextAttackAt = now + this.def.cooldownMs * (0.8 + Math.random() * 0.5);
      }
      return;
    }
    if (this.state === "recover") {
      this.setVelocityX(0);
      if (now >= this.stateUntil) {
        this.state = "approach";
        this.setTexture(this.def.texture);
      }
      return;
    }

    // approach / keep distance
    const want = this.def.ranged ? this.def.range : this.def.range * 0.75 + this.slot * 0.3;
    if (this.def.ranged) {
      if (dist < want - 120) this.setVelocityX(-dir * this.def.speed);
      else if (dist > want + 120) this.setVelocityX(dir * this.def.speed);
      else this.setVelocityX(0);
    } else if (dist > want) this.setVelocityX(dir * this.def.speed);
    else this.setVelocityX(0);

    const inReach = this.def.ranged ? dist < want + 300 : dist <= this.def.range;
    if (inReach && now >= this.nextAttackAt) {
      this.state = "windup";
      this.stateUntil = now + this.def.windupMs;
      if (this.def.windupTexture) this.setTexture(this.def.windupTexture);
      if (this.kind === "wolf") this.setVelocityY(-180); // little hop
    }
  }

  private attack(dir: number, dist: number) {
    const hero = this.host.hero;
    if (this.def.ranged) {
      this.host.throwCandy(this, hero.x);
      return;
    }
    if (this.kind === "wolf") {
      this.setVelocityX(dir * 520); // lunge
      this.host.sfx("bite");
    } else if (this.kind === "troll") {
      this.host.sfx("smash");
      this.scene.cameras.main.shake(180, 0.01);
    } else this.host.sfx("bite");
    if (dist <= this.def.range + 30 && Math.abs(hero.y - this.y) < 140) this.host.heroHurt(this.def.damage, this.x, this.def.name);
    this.scene.time.delayedCall(220, () => this.alive && this.setTexture(this.def.texture));
  }

  private drawHp() {
    const g = this.hpBar;
    g.clear();
    if (this.hp >= this.def.hp) return;
    const w = Math.max(50, this.def.body[0] * 0.8);
    const x = this.x - w / 2;
    const y = this.y - this.def.body[1] - 22;
    g.fillStyle(0x2b1a12, 1).fillRoundedRect(x - 3, y - 3, w + 6, 12, 5);
    g.fillStyle(0x6b2a22, 1).fillRoundedRect(x, y, w, 6, 3);
    g.fillStyle(0xff5f5f, 1).fillRoundedRect(x, y, Math.max(0, (w * this.hp) / this.def.hp), 6, 3);
  }
}
