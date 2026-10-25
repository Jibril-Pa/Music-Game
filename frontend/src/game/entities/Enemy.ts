import Phaser from "phaser";
import { C, FONT, GROUND_Y, chordPlate, flashSprite, light, nudge, reducedMotion, restoreTint, shake } from "../fx";

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
  /** It winds up (flickering) this long before the blow lands: the player's last chance. */
  windupMs: number;
  /** From a blow until it comes again (ms, default 650): knocked back, then it waits. */
  recoverMs?: number;
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
  /** Crouches through its windup, then pounces: the leap lands with the bite. */
  hop?: boolean;
  /** The hero stops walking this far before it (big enemies block the path). */
  haltDistance: number;
}

const CANDY: Projectile = { texture: "candy", scale: 1.4, name: "candy", spin: true };
/** After a blow, an attacker is knocked back for this long (ms). */
const KNOCKBACK_MS = 650;
/** A hopper pounces this long before its blow: about the hop's airtime, so it lands with the bite. */
const POUNCE_MS = 180;

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  wolf: { name: "Forest Wolf", speed: 115, damage: 8, symbolCount: 1, contactRange: 85, windupMs: 700, recoverMs: 1400, texture: "wolf", windupTexture: "wolf_bite", body: [100, 60], weight: 1, hop: true, haltDistance: 150 },
  goblin: { name: "Goblin", speed: 90, damage: 6, symbolCount: 1, contactRange: 75, windupMs: 560, recoverMs: 1200, texture: "goblin", body: [56, 84], weight: 0.9, haltDistance: 140 },
  troll: { name: "Bridge Troll", speed: 35, damage: 14, symbolCount: 3, contactRange: 150, windupMs: 750, texture: "troll", windupTexture: "troll_raise", body: [120, 170], weight: 3, heavy: true, haltDistance: 260 },
  witch: { name: "Gingerbread Witch", speed: 0, damage: 0, symbolCount: 2, contactRange: 0, windupMs: 0, texture: "witch", body: [64, 128], weight: 1.2, ranged: { projectile: CANDY, everyMs: 2700 }, altitude: 40, haltDistance: 480 },
  pup: { name: "Wolf Pup", speed: 170, damage: 6, symbolCount: 1, contactRange: 75, windupMs: 600, recoverMs: 1300, texture: "wolf", windupTexture: "wolf_bite", body: [80, 48], weight: 0.8, scale: 0.78, hop: true, haltDistance: 140 },
  giant: { name: "Giant", speed: 30, damage: 18, symbolCount: 4, contactRange: 165, windupMs: 800, texture: "giant", windupTexture: "giant_raise", body: [130, 236], weight: 3.5, heavy: true, haltDistance: 300 },

  scorpion: { name: "Scorpion", speed: 130, damage: 7, symbolCount: 1, contactRange: 85, windupMs: 540, recoverMs: 1150, texture: "scorpion", windupTexture: "scorpion_strike", body: [110, 50], weight: 0.9, haltDistance: 150 },
  thief: { name: "Thief", speed: 105, damage: 8, symbolCount: 1, contactRange: 80, windupMs: 560, recoverMs: 1200, texture: "thief", windupTexture: "thief_swing", body: [56, 112], weight: 1, haltDistance: 150 },
  mummy: { name: "Mummy", speed: 45, damage: 12, symbolCount: 2, contactRange: 90, windupMs: 650, texture: "mummy", body: [56, 126], weight: 1.6, haltDistance: 200 },
  djinn: { name: "Fire Djinn", speed: 0, damage: 0, symbolCount: 2, contactRange: 0, windupMs: 0, texture: "djinn", body: [70, 150], weight: 1.2, ranged: { projectile: { texture: "fireball", scale: 0.55, name: "fireball" }, everyMs: 2600 }, altitude: 60, haltDistance: 460 },
  jackal: { name: "Jackal", speed: 180, damage: 7, symbolCount: 1, contactRange: 80, windupMs: 580, recoverMs: 1250, texture: "jackal", windupTexture: "jackal_bite", body: [84, 50], weight: 0.8, scale: 0.85, hop: true, haltDistance: 140 },
  cavedoor: { name: "Cave Door", speed: 0, damage: 0, symbolCount: 3, contactRange: 0, windupMs: 0, texture: "cave_door", body: [140, 180], weight: 50, stationary: true, verbs: { hit: "the door rumbles", slain: "Open, Sesame!" }, haltDistance: 230 },
  sphinx: { name: "The Sphinx", speed: 0, damage: 0, symbolCount: 4, contactRange: 0, windupMs: 0, texture: "sphinx", body: [300, 210], weight: 50, ranged: { projectile: { texture: "riddle", scale: 1.3, name: "riddle", spin: true }, everyMs: 3000 }, haltDistance: 520 },

  drone: { name: "Drone", speed: 150, damage: 7, symbolCount: 1, contactRange: 80, windupMs: 520, recoverMs: 1100, texture: "drone", body: [80, 60], weight: 0.7, altitude: 90, haltDistance: 150 },
  tinsoldier: { name: "Tin Soldier", speed: 80, damage: 9, symbolCount: 1, contactRange: 80, windupMs: 600, recoverMs: 1250, texture: "tinsoldier", body: [50, 146], weight: 1.1, haltDistance: 150 },
  mech: { name: "Mech", speed: 40, damage: 16, symbolCount: 3, contactRange: 160, windupMs: 750, texture: "mech", windupTexture: "mech_raise", body: [130, 196], weight: 3, heavy: true, haltDistance: 270 },
  turret: { name: "Laser Turret", speed: 0, damage: 0, symbolCount: 2, contactRange: 0, windupMs: 0, texture: "turret", body: [90, 110], weight: 1.4, ranged: { projectile: { texture: "laser", scale: 1.2, name: "laser bolt", straight: true }, everyMs: 2200 }, altitude: 70, haltDistance: 460 },
  robopup: { name: "Robo-Pup", speed: 190, damage: 7, symbolCount: 1, contactRange: 80, windupMs: 560, recoverMs: 1200, texture: "robopup", windupTexture: "robopup_bite", body: [84, 50], weight: 0.8, scale: 0.85, hop: true, haltDistance: 140 },
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
  /** The key that plays a symbol ("1", "Z") for keyboard players, or "". */
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
  private pounced = false;
  private knockUntil = 0;
  readonly shadow: Phaser.GameObjects.Image;
  /** Speed and damage after the level's difficulty. */
  readonly speed: number;
  readonly damage: number;
  /** The level's pace: casters throw faster in harder levels. */
  private readonly pace: number;
  /** Wind-up and rest after the level's pace (slower levels give more time). */
  private readonly windupMs: number;
  private readonly recoverMs: number;
  /** Set pieces react when it's played away (the cave door opens...). */
  onSlain: (() => void) | null = null;
  /** Raise the chord badge this much (px) so it doesn't cover a neighbour's. */
  badgeLift = 0;
  private lift = 0;
  private badge: Phaser.GameObjects.Container;
  /** The plate's size at scale 1, cached when it's drawn (no getBounds per frame). */
  private badgeW = 0;
  private badgeH = 46;
  /** "!" on the plate while it winds up a blow. */
  private windupTag: Phaser.GameObjects.Container | null = null;
  /** The plate's pop-in scale, times the focus scale (1.12 for the foe to read now). */
  private readonly pop = { s: 1 };
  private focusScale = 1;
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
    this.windupMs = this.def.windupMs / this.pace;
    this.recoverMs = Math.max(KNOCKBACK_MS, (this.def.recoverMs ?? KNOCKBACK_MS) / this.pace);
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
    restoreTint(this);
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

  /** Where the chord badge sits before any lift. */
  get badgeY(): number {
    return this.y - this.def.body[1] - 40;
  }

  /** Half the plate's width as drawn now (for stacking). */
  get badgeHalfWidth(): number {
    return (this.badgeW * this.badge.scaleX) / 2;
  }

  /** The plate's height with its keycaps (for stacking). */
  get badgeHeight(): number {
    return this.badgeH;
  }

  /** Where the plate is drawn (kept inside the view while the foe walks in). */
  get badgeX(): number {
    return this.badge.x;
  }

  /** The plate's rectangle in world px (keycaps included). */
  get badgeBounds(): Phaser.Geom.Rectangle {
    const k = this.badge.scaleX;
    const w = this.badgeW * k;
    return new Phaser.Geom.Rectangle(this.badge.x - w / 2, this.badge.y - 23 * k, w, this.badgeH * k);
  }

  /** The foe to read now gets its plate a size up; the others step back a little. */
  setFocus(on: boolean, anyFocused: boolean) {
    if (!this.alive) return;
    const target = on ? 1.12 : 1;
    this.focusScale = reducedMotion() ? target : this.focusScale + (target - this.focusScale) * 0.25;
    this.badge.setScale(this.pop.s * this.focusScale).setAlpha(on || !anyFocused ? 1 : 0.85);
  }

  /** A wrong chord: the plate shakes its head. */
  nudge() {
    if (this.alive) nudge(this.scene, this.badge);
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

  /** Its chords on one gold plate (any of them can be played next), keycaps for keyboard players. */
  private renderBadge() {
    const b = this.badge;
    const scene = this.scene;
    b.removeAll(true);
    this.windupTag = null;
    if (!this.symbols.length) return;
    const plate = chordPlate(scene, this.symbols, this.symbols.map((s) => this.host.keyHint(s)));
    this.badgeW = plate.w;
    this.badgeH = plate.h + (plate.keycaps ? 14 : 0);
    // The blow is coming: a shape, not just the colour flicker.
    const tag = scene.add
      .container(plate.w / 2 - 2, -21, [
        scene.add.graphics().fillStyle(C.rose, 1).fillCircle(0, 0, 11).lineStyle(2, C.ink, 1).strokeCircle(0, 0, 11),
        scene.add.text(0, 1, "!", { fontFamily: FONT, fontSize: "17px", fontStyle: "900", color: "#fff6dc" }).setOrigin(0.5),
      ])
      .setVisible(this.state === "windup");
    this.windupTag = tag;
    b.add([...plate.parts, tag]);
    scene.tweens.killTweensOf(this.pop);
    if (reducedMotion()) this.pop.s = 1;
    else {
      this.pop.s = 0.6;
      scene.tweens.add({ targets: this.pop, s: 1, duration: 160, ease: "Back.Out" });
    }
    b.setScale(this.pop.s * this.focusScale);
  }

  /**
   * Paper-cutout life: a waddle while walking, a slow sway when standing,
   * a tilt for flyers. Rotation only, so physics isn't affected.
   */
  animate(now: number) {
    if (!this.alive || this.def.stationary) return;
    const body = this.body2;
    const ph = now / 1000 + this.id * 0.37;
    let target: number;
    if (this.flying) target = Math.sin(ph * 3.2) * 4;
    else if (this.state === "windup") target = -6;
    else if (Math.abs(body.velocity.x) > 8 && (body.blocked.down || body.touching.down)) target = Math.sin(ph * 11) * 6;
    else target = Math.sin(ph * 2.2) * 1.5;
    this.angle += (target - this.angle) * 0.35;
  }

  /** One matching chord: pops that symbol (any of them, in any order; the first if none is given). Returns true if that slew it. */
  hit(now: number, symbol?: string): boolean {
    if (!this.alive || !this.symbols.length) return false;
    const at = symbol === undefined ? 0 : this.symbols.indexOf(symbol);
    this.symbols.splice(Math.max(0, at), 1);
    flashSprite(this.scene, this, 0xffffff, 80);
    if (!this.symbols.length) {
      this.die();
      return true;
    }
    this.renderBadge();
    this.state = "hurt";
    this.stateUntil = now + 320;
    restoreTint(this);
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
    this.lift += (this.badgeLift - this.lift) * 0.25;
    // Walking in (or out): the plate stays whole inside the view.
    const view = this.scene.cameras.main.worldView;
    const half = this.badgeHalfWidth;
    this.badge.setPosition(Phaser.Math.Clamp(this.x, view.x + half + 8, view.right - half - 8), this.badgeY - this.lift);
    this.windupTag?.setVisible(this.state === "windup");
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
      this.setTint(Math.floor(now / 80) % 2 ? 0xffb066 : light.tint);
      if (this.def.hop && !this.flying && !this.pounced && this.stateUntil - now <= POUNCE_MS) {
        this.pounced = true;
        this.setVelocityY(-160);
        return;
      }
      if (now >= this.stateUntil) {
        restoreTint(this);
        if (Math.abs(dx) <= this.def.contactRange + 50) {
          this.host.sfx(this.def.heavy ? "smash" : "bite");
          if (this.def.heavy) shake(this.scene, 180, 0.01);
          this.host.heroHurt(this.damage, this.x, this.def.name);
        }
        // Bounce back and come again.
        this.setVelocity((-dir * 330) / this.def.weight, this.flying ? 0 : -200 / Math.sqrt(this.def.weight));
        this.state = "recover";
        this.knockUntil = now + KNOCKBACK_MS;
        this.stateUntil = now + this.recoverMs;
        this.scene.time.delayedCall(200, () => this.alive && this.setTexture(this.def.texture));
      }
      return;
    }
    if (this.state === "recover") {
      // Knocked back, then it stands and catches its breath before coming again.
      if (now >= this.knockUntil) this.setVelocityX(0);
      if (now >= this.stateUntil) this.state = "approach";
      return;
    }

    // approach
    if (Math.abs(dx) <= this.def.contactRange) {
      this.state = "windup";
      this.stateUntil = now + this.windupMs;
      this.pounced = false;
      this.setVelocityX(0);
      if (this.def.windupTexture) this.setTexture(this.def.windupTexture);
    } else {
      this.setVelocityX(dir * this.speed);
    }
  }

}
