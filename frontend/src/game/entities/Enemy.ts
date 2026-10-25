import Phaser from "phaser";
import { FONT, GROUND_Y, flashSprite } from "../fx";

export type EnemyKind =
  // Once Upon a Time
  | "wolf" | "goblin" | "troll" | "witch" | "pup" | "giant"
  // A Thousand and One Nights
  | "scorpion" | "thief" | "mummy" | "djinn" | "jackal" | "cavedoor" | "sphinx"
  // Year 3000
  | "drone" | "tinsoldier" | "mech" | "turret" | "robopup" | "lasergate" | "nightingale";

export interface Projectile {
  texture: string;
  scale: number;
  /** "popped the candy" */
  name: string;
  /** Flies in a straight line (lasers) instead of a lob. */
  straight?: boolean;
  /** Spins in flight; otherwise points where it's going. */
  spin?: boolean;
}

export interface EnemyDef {
  name: string;
  /** Walking speed toward the hero (px/s). */
  speed: number;
  /** Damage when it reaches the hero (casters hurt with what they throw). */
  damage: number;
  /** How many chords it takes (Magic Cat Academy style: one symbol per hit). */
  symbolCount: number;
  /** Attacks when this close. */
  contactRange: number;
  windupMs: number;
  texture: string;
  windupTexture?: string;
  body: [number, number];
  /** Heavier enemies get knocked back less. */
  weight: number;
  scale?: number;
  /** Throws things from a distance instead of walking up. */
  ranged?: { projectile: Projectile; everyMs: number };
  /** Flies this high above the ground (px), bobbing. */
  altitude?: number;
  /** Doesn't move or attack: a door or gate to play open. */
  stationary?: boolean;
  /** What "the ear" says when a chord lands / finishes it (default "hit the x" / "slew the x"). */
  verbs?: { hit: string; slain: string };
  /** Big hitter: a smash that shakes the screen. */
  heavy?: boolean;
  /** Leaps as it bites. */
  hop?: boolean;
  /** The hero stops walking this far before it (big enemies block the path). */
  haltDistance: number;
}

const CANDY: Projectile = { texture: "candy", scale: 1.4, name: "candy", spin: true };

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  wolf: { name: "Forest Wolf", speed: 115, damage: 8, symbolCount: 1, contactRange: 85, windupMs: 380, texture: "wolf", windupTexture: "wolf_bite", body: [100, 60], weight: 1, hop: true, haltDistance: 150 },
  goblin: { name: "Goblin", speed: 90, damage: 6, symbolCount: 1, contactRange: 75, windupMs: 380, texture: "goblin", body: [56, 84], weight: 0.9, haltDistance: 140 },
  troll: { name: "Bridge Troll", speed: 35, damage: 14, symbolCount: 3, contactRange: 150, windupMs: 750, texture: "troll", windupTexture: "troll_raise", body: [120, 170], weight: 3, heavy: true, haltDistance: 260 },
  witch: { name: "Gingerbread Witch", speed: 0, damage: 0, symbolCount: 2, contactRange: 0, windupMs: 0, texture: "witch", body: [64, 128], weight: 1.2, ranged: { projectile: CANDY, everyMs: 2700 }, altitude: 40, haltDistance: 480 },
  pup: { name: "Wolf Pup", speed: 170, damage: 6, symbolCount: 1, contactRange: 75, windupMs: 300, texture: "wolf", windupTexture: "wolf_bite", body: [80, 48], weight: 0.8, scale: 0.78, hop: true, haltDistance: 140 },
  giant: { name: "Giant", speed: 30, damage: 18, symbolCount: 4, contactRange: 165, windupMs: 800, texture: "giant", windupTexture: "giant_raise", body: [130, 236], weight: 3.5, heavy: true, haltDistance: 300 },

  scorpion: { name: "Scorpion", speed: 130, damage: 7, symbolCount: 1, contactRange: 85, windupMs: 340, texture: "scorpion", windupTexture: "scorpion_strike", body: [110, 50], weight: 0.9, haltDistance: 150 },
  thief: { name: "Thief", speed: 105, damage: 8, symbolCount: 1, contactRange: 80, windupMs: 360, texture: "thief", windupTexture: "thief_swing", body: [56, 112], weight: 1, haltDistance: 150 },
  mummy: { name: "Mummy", speed: 45, damage: 12, symbolCount: 2, contactRange: 90, windupMs: 650, texture: "mummy", body: [56, 126], weight: 1.6, haltDistance: 200 },
  djinn: { name: "Fire Djinn", speed: 0, damage: 0, symbolCount: 2, contactRange: 0, windupMs: 0, texture: "djinn", body: [70, 150], weight: 1.2, ranged: { projectile: { texture: "fireball", scale: 0.55, name: "fireball" }, everyMs: 2600 }, altitude: 60, haltDistance: 460 },
  jackal: { name: "Jackal", speed: 180, damage: 7, symbolCount: 1, contactRange: 80, windupMs: 300, texture: "jackal", windupTexture: "jackal_bite", body: [84, 50], weight: 0.8, scale: 0.85, hop: true, haltDistance: 140 },
  cavedoor: { name: "Cave Door", speed: 0, damage: 0, symbolCount: 3, contactRange: 0, windupMs: 0, texture: "cave_door", body: [140, 180], weight: 50, stationary: true, verbs: { hit: "the door rumbles", slain: "Open, Sesame!" }, haltDistance: 230 },
  sphinx: { name: "The Sphinx", speed: 0, damage: 0, symbolCount: 4, contactRange: 0, windupMs: 0, texture: "sphinx", body: [300, 210], weight: 50, ranged: { projectile: { texture: "riddle", scale: 1.3, name: "riddle", spin: true }, everyMs: 3000 }, haltDistance: 520 },

  drone: { name: "Drone", speed: 150, damage: 7, symbolCount: 1, contactRange: 80, windupMs: 320, texture: "drone", body: [80, 60], weight: 0.7, altitude: 90, haltDistance: 150 },
  tinsoldier: { name: "Tin Soldier", speed: 80, damage: 9, symbolCount: 1, contactRange: 80, windupMs: 420, texture: "tinsoldier", body: [50, 146], weight: 1.1, haltDistance: 150 },
  mech: { name: "Mech", speed: 40, damage: 16, symbolCount: 3, contactRange: 160, windupMs: 750, texture: "mech", windupTexture: "mech_raise", body: [130, 196], weight: 3, heavy: true, haltDistance: 270 },
  turret: { name: "Laser Turret", speed: 0, damage: 0, symbolCount: 2, contactRange: 0, windupMs: 0, texture: "turret", body: [90, 110], weight: 1.4, ranged: { projectile: { texture: "laser", scale: 1.2, name: "laser bolt", straight: true }, everyMs: 2200 }, altitude: 70, haltDistance: 460 },
  robopup: { name: "Robo-Pup", speed: 190, damage: 7, symbolCount: 1, contactRange: 80, windupMs: 280, texture: "robopup", windupTexture: "robopup_bite", body: [84, 50], weight: 0.8, scale: 0.85, hop: true, haltDistance: 140 },
  lasergate: { name: "Laser Gate", speed: 0, damage: 0, symbolCount: 3, contactRange: 0, windupMs: 0, texture: "laser_gate", body: [150, 300], weight: 50, stationary: true, verbs: { hit: "a laser fizzles out", slain: "gate shut down!" }, haltDistance: 230 },
  nightingale: { name: "The Clockwork Nightingale", speed: 0, damage: 0, symbolCount: 4, contactRange: 0, windupMs: 0, texture: "nightingale", body: [200, 170], weight: 2, ranged: { projectile: { texture: "note", scale: 1.2, name: "song note", spin: true }, everyMs: 2400 }, altitude: 150, haltDistance: 520 },
};

/** Per-level tuning applied to every foe (see levels.ts Difficulty). */
export interface FoeMods {
  speed: number;
  damage: number;
}

export type EnemyState = "approach" | "windup" | "recover" | "hurt" | "dead";

export interface EnemyHost {
  hero: Phaser.GameObjects.Sprite & { x: number; y: number };
  heroHurt(amount: number, fromX: number, source: string): void;
  /** A caster throws its projectile at the hero. */
  throwProjectile(from: Enemy): void;
  sfx(name: string): void;
  isFrozen(): boolean;
  /** Keyboard hint for a symbol ("key 1"), or "". */
  keyHint(symbol: string): string;
}

let nextId = 1;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly id = nextId++;
  readonly def: EnemyDef;
  symbols: string[];
  state: EnemyState = "approach";
  stateUntil = 0;
  nextThrowAt = 0;
  readonly shadow: Phaser.GameObjects.Image;
  /** Speed and damage after the level's difficulty. */
  readonly speed: number;
  readonly damage: number;
  /** The level's pace: casters throw faster in harder levels. */
  private readonly pace: number;
  /** Set pieces react when it's played away (the cave door opens...). */
  onSlain: (() => void) | null = null;
  private badge: Phaser.GameObjects.Container;
  private baseY = GROUND_Y;

  constructor(
    scene: Phaser.Scene,
    readonly kind: EnemyKind,
    x: number,
    private readonly host: EnemyHost,
    symbols: string[],
    mods: FoeMods = { speed: 1, damage: 1 },
  ) {
    super(scene, x, GROUND_Y, ENEMY_DEFS[kind].texture);
    this.def = ENEMY_DEFS[kind];
    this.symbols = [...symbols];
    this.pace = Math.max(0.5, mods.speed);
    this.speed = this.def.speed * mods.speed;
    this.damage = Math.round(this.def.damage * mods.damage);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const s = this.def.scale ?? 1;
    this.setOrigin(0.5, 1).setDepth(18).setScale(s).setFlipX(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.def.body[0] / s, this.def.body[1] / s).setOffset((this.width - this.def.body[0] / s) / 2, this.height - this.def.body[1] / s);
    if (this.flying) {
      body.setAllowGravity(false);
      this.baseY = GROUND_Y - (this.def.altitude ?? 0);
      this.y = this.baseY;
    }
    this.shadow = scene.add.image(x, GROUND_Y + 4, "shadow").setDepth(5).setScale((this.def.body[0] / 100) * 1.1, 1);
    this.badge = scene.add.container(x, 0).setDepth(45);
    this.renderBadge();
    this.nextThrowAt = scene.time.now + 1200;
  }

  get alive(): boolean {
    return this.state !== "dead";
  }

  get next(): string | undefined {
    return this.symbols[0];
  }

  get hitHeight(): number {
    return this.def.body[1];
  }

  get body2(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get flying(): boolean {
    return (this.def.altitude ?? 0) > 0;
  }

  /** Where it flies (or stands); scenes move this for entrances. */
  setBaseY(y: number) {
    this.baseY = y;
  }

  /** The symbols over its head; the next one is big and gold, with its key. */
  private renderBadge() {
    const b = this.badge;
    b.removeAll(true);
    if (!this.symbols.length) return;
    const items = this.symbols.map((sym, i) => {
      const big = i === 0;
      const t = this.scene.add
        .text(0, 0, sym, { fontFamily: FONT, fontSize: big ? "30px" : "21px", fontStyle: "bold", color: "#2b1a12" })
        .setOrigin(0.5);
      return { t, w: Math.max(big ? 54 : 40, t.width + 20), h: big ? 46 : 34, big };
    });
    const total = items.reduce((sum, it) => sum + it.w, 0) + (items.length - 1) * 6;
    let x = -total / 2;
    const parts: Phaser.GameObjects.GameObject[] = [];
    for (const it of items) {
      const g = this.scene.add.graphics();
      g.fillStyle(it.big ? 0xffd25e : 0xf6e7c1, it.big ? 1 : 0.92).fillRoundedRect(x, -it.h / 2, it.w, it.h, 12);
      g.lineStyle(it.big ? 4 : 3, 0x2b1a12, 1).strokeRoundedRect(x, -it.h / 2, it.w, it.h, 12);
      it.t.setPosition(x + it.w / 2, 0);
      parts.push(g, it.t);
      x += it.w + 6;
    }
    const hint = this.host.keyHint(this.symbols[0]);
    if (hint) {
      parts.push(
        this.scene.add
          .text(-total / 2 + items[0].w / 2, items[0].h / 2 + 12, hint, { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#fff6dc", stroke: "#2b1a12", strokeThickness: 4 })
          .setOrigin(0.5),
      );
    }
    b.add(parts);
    b.setScale(0.6);
    this.scene.tweens.add({ targets: b, scale: 1, duration: 160, ease: "Back.Out" });
  }

  /** One matching chord: pops the next symbol. Returns true if that slew it. */
  hit(now: number): boolean {
    if (!this.alive || !this.symbols.length) return false;
    this.symbols.shift();
    flashSprite(this.scene, this, 0xffffff, 80);
    if (!this.symbols.length) {
      this.die();
      return true;
    }
    this.renderBadge();
    this.state = "hurt";
    this.stateUntil = now + 320;
    this.clearTint();
    this.setTexture(this.def.texture);
    if (!this.def.ranged && !this.def.stationary) this.setVelocity(260 / this.def.weight, -160 / Math.sqrt(this.def.weight));
    return false;
  }

  /** Super move: gone at once. */
  vanish() {
    if (!this.alive) return;
    this.symbols = [];
    this.die();
  }

  private die() {
    this.state = "dead";
    const cb = this.onSlain;
    this.onSlain = null;
    cb?.();
    this.badge.removeAll(true);
    this.badge.destroy();
    this.body2.setAllowGravity(true);
    this.setVelocity(320, -520);
    this.body2.checkCollision.none = true;
    this.scene.tweens.add({ targets: this, angle: 200, alpha: 0, duration: 750, ease: "Cubic.In" });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 400 });
    this.scene.time.delayedCall(800, () => {
      this.shadow.destroy();
      this.destroy();
    });
  }

  tick(now: number) {
    if (!this.alive) return;
    const body = this.body2;
    this.shadow.setPosition(this.x, GROUND_Y + 4);
    this.badge.setPosition(this.x, this.y - this.def.body[1] - 40);
    if (this.host.isFrozen()) return;

    const hero = this.host.hero;
    const dx = hero.x - this.x;
    const dir = Math.sign(dx) || -1;
    if (this.def.stationary) {
      // A door or a gate: it just stands there until it's played open.
      this.setVelocityX(0);
      if (this.state === "hurt" && now >= this.stateUntil) this.state = "approach";
      return;
    }
    this.setFlipX(dx < 0);
    if (this.flying) {
      this.setVelocityY(0);
      this.y = this.baseY + Math.sin(now / (this.def.ranged ? 400 : 260)) * (this.def.ranged ? 10 : 6);
    }

    if (this.def.ranged) {
      this.setVelocityX(0);
      const onScreen = this.x < this.scene.cameras.main.worldView.right - 40;
      if (onScreen && now >= this.nextThrowAt && this.state !== "hurt") {
        this.host.throwProjectile(this);
        this.nextThrowAt = now + this.def.ranged.everyMs / this.pace;
      }
      if (this.state === "hurt" && now >= this.stateUntil) this.state = "approach";
      return;
    }

    const grounded = this.flying || body.blocked.down || body.touching.down;
    if (this.state === "hurt") {
      if (now >= this.stateUntil && grounded) this.state = "approach";
      return;
    }
    if (!grounded) return;

    if (this.state === "windup") {
      this.setVelocityX(0);
      this.setTint(Math.floor(now / 80) % 2 ? 0xffb066 : 0xffffff);
      if (now >= this.stateUntil) {
        this.clearTint();
        if (Math.abs(dx) <= this.def.contactRange + 50) {
          this.host.sfx(this.def.heavy ? "smash" : "bite");
          if (this.def.heavy) this.scene.cameras.main.shake(180, 0.01);
          this.host.heroHurt(this.damage, this.x, this.def.name);
        }
        // Bounce back and come again.
        this.setVelocity((-dir * 330) / this.def.weight, this.flying ? 0 : -200 / Math.sqrt(this.def.weight));
        this.state = "recover";
        this.stateUntil = now + 650;
        this.scene.time.delayedCall(200, () => this.alive && this.setTexture(this.def.texture));
      }
      return;
    }
    if (this.state === "recover") {
      if (now >= this.stateUntil) this.state = "approach";
      return;
    }

    // approach
    if (Math.abs(dx) <= this.def.contactRange) {
      this.state = "windup";
      this.stateUntil = now + this.def.windupMs;
      this.setVelocityX(0);
      if (this.def.windupTexture) this.setTexture(this.def.windupTexture);
      if (this.def.hop && !this.flying) this.setVelocityY(-160);
    } else {
      this.setVelocityX(dir * this.speed);
    }
  }

}
