/**
 * Shared combat for Level 1 and the boss: notes -> rhythm grade -> combo ->
 * move; hits, knockback, hit-stop, shake, projectiles, shield, heal, super.
 * Movement is on the keyboard; attacks only come from notes.
 */

import Phaser from "phaser";
import { ComboEngine, type MoveDef } from "@/lib/combat/combos";
import { GRADE_DAMAGE, GRADE_MAGIC, judge, type Grade } from "@/lib/combat/rhythm";
import { gameAudio, type SfxName } from "@/lib/game-audio/audio";
import type { SongClock } from "@/lib/game-audio/music";
import { getNoteInput } from "@/lib/input/noteInput";
import type { NoteEvent } from "@/lib/input/types";
import { Enemy, type EnemyHost, type EnemyKind } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import { EventBus, onBus } from "../EventBus";
import { EV, type HeardEntry, type HudState, type MoveUsed } from "../events";
import { FONT, GROUND_Y, burst, damageNumber, gradePopup, popup, text } from "../fx";
import { newStats, session } from "../state";

/** Anything the hero can hit (enemies, the boss). */
export interface Hittable {
  x: number;
  y: number;
  readonly alive: boolean;
  readonly hitHalfWidth: number;
  readonly hitHeight: number;
  takeHit(amount: number, dir: number, knockback: number, launch: number, now: number): boolean;
}

const PC_MIDI: Record<string, number> = { C: 48, "C#": 49, D: 50, "D#": 51, E: 52, F: 53, "F#": 54, G: 55, "G#": 56, A: 57, "A#": 58, B: 59 };

interface Fireball {
  img: Phaser.GameObjects.Image;
  id: number;
  dir: number;
  born: number;
  hit: Set<Hittable>;
  damage: number;
  move: MoveDef;
  magMul: number;
}

interface Candy {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
}

let projectileId = 1_000_000;

export abstract class FightScene extends Phaser.Scene implements EnemyHost {
  hero!: Hero;
  enemies: Enemy[] = [];
  protected combo = new ComboEngine();
  protected music: SongClock | null = null;
  protected worldWidth = 1280;
  protected bounds = { left: 40, right: 1240 };
  protected cinematic = false;
  protected ended = false;
  protected ground!: Phaser.GameObjects.Rectangle;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private unsubNote: (() => void) | null = null;
  private frozenUntil = 0;
  private dashUntil = 0;
  private comboHits = 0;
  private lastHitAt = 0;
  private lastHudAt = 0;
  private lastFpsAt = 0;
  private lastProgressAt = 0;
  private fireballs: Fireball[] = [];
  private candies: Candy[] = [];
  private healHintShown = false;

  // ---------------------------------------------------------------- subclass hooks
  protected abstract buildWorld(): void;
  protected abstract heroStartX(): number;
  /** Per-frame scene logic (waves, boss AI...). */
  protected tickScene(_now: number, _dt: number): void {}
  /** Return true if the note was used up (e.g. a boss parry). */
  protected interceptNote(_ev: NoteEvent, _grade: Grade | null): string | null {
    return null;
  }
  /** Extra things the hero can hit (the boss). */
  protected extraTargets(): Hittable[] {
    return [];
  }
  protected hudExtra(): Partial<HudState> {
    return {};
  }

  create() {
    this.enemies = [];
    this.fireballs = [];
    this.candies = [];
    this.cinematic = false;
    this.ended = false;
    this.comboHits = 0;
    this.healHintShown = false;
    this.combo.reset();
    session.stats ??= newStats();

    this.physics.world.setBounds(0, -400, this.worldWidth, 720 + 800);
    this.cameras.main.setBounds(0, 0, this.worldWidth, 720);
    this.buildWorld();

    this.ground = this.add.rectangle(this.worldWidth / 2, GROUND_Y + 60, this.worldWidth, 120, 0x000000, 0).setVisible(false);
    this.physics.add.existing(this.ground, true);

    this.hero = new Hero(this, this.heroStartX(), session.heroMaxHp);
    this.physics.add.collider(this.hero, this.ground);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("LEFT,RIGHT,UP,A,D,W,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture("SPACE,UP,LEFT,RIGHT");

    this.unsubNote = getNoteInput().on(this.onNote);
    onBus(this, EV.setPaused, this.onPaused as (...a: never[]) => void);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.cameras.main.fadeIn(400, 20, 12, 8);
    EventBus.emit(EV.sceneReady, this);
  }

  // ---------------------------------------------------------------- EnemyHost
  isFrozen(): boolean {
    return this.cinematic || this.time.now < this.frozenUntil || this.ended;
  }

  sfx(name: string) {
    gameAudio.play(name as SfxName);
  }

  addEnemy(kind: EnemyKind, x: number): Enemy {
    const e = new Enemy(this, kind, x, this);
    this.physics.add.collider(e, this.ground);
    this.enemies.push(e);
    return e;
  }

  throwCandy(from: Enemy, targetX: number) {
    gameAudio.play("throw");
    const img = this.add.image(from.x, from.y - 90, "candy").setDepth(26);
    const flight = 0.9;
    const vx = (targetX - from.x) / flight;
    const vy = (GROUND_Y - 60 - (from.y - 90) - 0.5 * 1100 * flight * flight) / flight;
    this.candies.push({ img, vx, vy, damage: from.def.damage });
  }

  heroHurt(amount: number, fromX: number, source: string) {
    const now = this.time.now;
    const hero = this.hero;
    if (this.ended || this.cinematic || hero.hp <= 0) return;
    if (hero.isShielded(now)) {
      gameAudio.play("block");
      burst(this, hero.x, hero.y - 70, { tint: [0xc6f3ff, 0xffffff], count: 12, speed: 220 });
      popup(this, hero.x, hero.y - 170, "Blocked!", "#c6f3ff", 26);
      return;
    }
    if (now < hero.invulnUntil) return;
    hero.hp = Math.max(0, hero.hp - amount);
    hero.invulnUntil = now + 800;
    hero.hurtUntil = now + 220;
    const dir = Math.sign(hero.x - fromX) || -hero.facing;
    hero.setVelocity(dir * 380, -260);
    this.dashUntil = now + 200;
    damageNumber(this, hero.x, hero.y - 140, amount, null);
    gameAudio.play("hurt");
    this.cameras.main.shake(120, 0.006);
    this.comboHits = 0;
    void source;
    if (hero.hp <= 0) this.defeat();
    else if (!this.healHintShown && hero.hp <= hero.maxHp * 0.35) {
      this.healHintShown = true;
      popup(this, hero.x, hero.y - 200, "Low health! Strum G → C → D to heal", "#ffd6f2", 26, 2200).setDepth(70);
      EventBus.emit(EV.toast, "Low health! Godmother's Grace heals: strum G → C → D (keys 2 3 4).");
    }
  }

  // ---------------------------------------------------------------- input
  private onPaused(paused: boolean) {
    if (this.ended) return;
    if (paused) {
      this.music?.pause();
      if (!this.scene.isPaused()) this.scene.pause();
    } else {
      if (this.scene.isPaused()) this.scene.resume();
      this.music?.resume();
    }
  }

  private onNote = (ev: NoteEvent) => {
    if (session.paused || this.ended || !this.hero?.active || this.scene.isPaused() || !this.scene.isActive()) return;
    const stats = session.stats!;
    stats.notesHeard++;
    const offset = this.music?.offsetToNearestBeat(ev.time) ?? null;
    const grade = this.music ? judge(offset, session.practice) : null;
    if (grade === "perfect") {
      stats.perfects++;
      this.hero.addMagic(2);
    }

    const intercepted = this.interceptNote(ev, grade);
    if (intercepted) {
      this.emitHeard({ ev, grade, result: intercepted, special: true });
      return;
    }
    if (this.cinematic) return;

    const res = this.combo.push(ev, { magicFull: this.hero.magic >= 100, practice: session.practice });
    this.performMove(res.move, grade, ev);
    if (res.isSpecial) stats.specials++;
    this.emitHeard({ ev, grade, result: res.move.name, special: res.isSpecial });
    if (grade && grade !== "off") gradePopup(this, this.hero.x, this.hero.y - 190, grade);
    else if (grade === "off" && this.music) gradePopup(this, this.hero.x, this.hero.y - 190, "off");
    this.emitProgress();
  };

  private emitHeard(h: HeardEntry) {
    EventBus.emit(EV.heard, h);
  }

  private emitProgress() {
    this.lastProgressAt = this.time.now;
    EventBus.emit(EV.comboProgress, this.combo.progress({ magicFull: this.hero.magic >= 100, practice: session.practice }));
  }

  // ---------------------------------------------------------------- moves
  private targets(): Hittable[] {
    const list: Hittable[] = this.enemies.filter((e) => e.alive).map((e) => e as unknown as Hittable);
    return list.concat(this.extraTargets().filter((t) => t.alive));
  }

  /** Beginner-friendly: turn toward the nearest enemy before attacking. */
  private autoFace() {
    let best: Hittable | null = null;
    let bestD = 420;
    for (const t of this.targets()) {
      const d = Math.abs(t.x - this.hero.x);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) this.hero.facing = best.x >= this.hero.x ? 1 : -1;
  }

  private meleeHits(range: number): Hittable[] {
    const h = this.hero;
    return this.targets().filter((t) => {
      const ahead = (t.x - h.x) * h.facing;
      return ahead >= -40 && ahead <= range + t.hitHalfWidth && Math.abs(t.y - h.y) < 260;
    });
  }

  private slashFx(scale: number, tint: number, yOff = -70) {
    const h = this.hero;
    const s = this.add
      .image(h.x + h.facing * 60 * scale, h.y + yOff, "slash")
      .setDepth(30)
      .setTint(tint)
      .setFlipX(h.facing < 0)
      .setScale(scale * 0.6)
      .setAlpha(0.95);
    this.tweens.add({ targets: s, scale: scale, alpha: 0, x: s.x + h.facing * 30, duration: 220, ease: "Cubic.Out", onComplete: () => s.destroy() });
  }

  /** Freeze the action for a moment (physics is paused/resumed in update()). */
  private hitStop(ms: number) {
    if (ms <= 0) return;
    this.frozenUntil = Math.max(this.frozenUntil, this.time.now + ms);
    this.syncPhysicsPause();
  }

  /** Single source of truth for pausing physics: hit-stop or the super cinematic. */
  private syncPhysicsPause() {
    const world = this.physics.world;
    const freeze = this.cinematic || this.time.now < this.frozenUntil;
    if (freeze && !world.isPaused) world.pause();
    else if (!freeze && world.isPaused) world.resume();
  }

  protected hitTarget(t: Hittable, move: MoveDef, dmgMul: number, magMul: number, dir: number = this.hero.facing, damageOverride?: number) {
    const now = this.time.now;
    const dmg = Math.round((damageOverride ?? move.damage) * dmgMul);
    const killed = t.takeHit(dmg, dir, move.knockback, move.launch, now);
    const heavy = move.hitStopMs >= 60;
    damageNumber(this, t.x, t.y - t.hitHeight - 10, dmg, dmgMul > 1 ? "perfect" : "good", heavy);
    burst(this, t.x - dir * 10, t.y - t.hitHeight * 0.55, { tint: [move.color, 0xffffff], count: heavy ? 18 : 8, speed: heavy ? 380 : 240 });
    gameAudio.play(heavy ? "heavyHit" : "hit");
    this.hitStop(move.hitStopMs);
    if (move.shake) this.cameras.main.shake(140, move.shake);
    this.hero.addMagic(move.magicGain * magMul);
    this.comboHits = now - this.lastHitAt < 2500 ? this.comboHits + 1 : 1;
    this.lastHitAt = now;
    session.stats!.maxCombo = Math.max(session.stats!.maxCombo, this.comboHits);
    if (killed) {
      gameAudio.play("poof");
      burst(this, t.x, t.y - t.hitHeight / 2, { texture: "leafp", tint: [0x86c75e, 0xf2c14e, 0xff9ff3], count: 16, speed: 320 });
    }
  }

  protected performMove(move: MoveDef, grade: Grade | null, ev: NoteEvent) {
    const now = this.time.now;
    const h = this.hero;
    const dmgMul = grade ? GRADE_DAMAGE[grade] : 1;
    const magMul = grade ? GRADE_MAGIC[grade] : 1;
    this.autoFace();
    EventBus.emit(EV.moveUsed, { id: move.id, name: move.name, grade } satisfies MoveUsed);
    const special = move.id !== "luteStrike";
    if (special) popup(this, h.x, h.y - 230, move.name, "#ffe9a8", 28, 900);

    switch (move.kind) {
      case "jab": {
        h.actionUntil = now + 170;
        h.x += h.facing * 10;
        this.slashFx(0.55, move.color);
        gameAudio.play("jab", { midi: ev.midi ?? PC_MIDI[ev.pitchClass] ?? 52 });
        for (const t of this.meleeHits(move.range)) this.hitTarget(t, move, dmgMul, magMul);
        break;
      }
      case "slash": {
        h.actionUntil = now + 280;
        this.dashUntil = now + 140;
        h.setVelocityX(h.facing * 620);
        this.slashFx(1.15, move.color);
        gameAudio.play("slash");
        for (const t of this.meleeHits(move.range)) this.hitTarget(t, move, dmgMul, magMul);
        break;
      }
      case "projectile": {
        h.actionUntil = now + 240;
        gameAudio.play("fireball");
        const img = this.add.image(h.x + h.facing * 70, h.y - 70, "fireball").setDepth(28).setFlipX(h.facing < 0).setScale(0.6);
        this.tweens.add({ targets: img, scale: 1.1, duration: 160 });
        this.fireballs.push({ img, id: projectileId++, dir: h.facing, born: now, hit: new Set(), damage: move.damage, move, magMul: magMul * dmgMul });
        burst(this, img.x, img.y, { tint: [0xff8a3d, 0xffd166], count: 10, speed: 160 });
        break;
      }
      case "launcher": {
        h.actionUntil = now + 320;
        if (h.onGround) h.setVelocityY(-560);
        gameAudio.play("uppercut");
        burst(this, h.x + h.facing * 50, GROUND_Y - 10, { texture: "leafp", tint: [0x8fe36a, 0x5fa548], count: 22, speed: 520, angle: { min: 250, max: 290 }, gravityY: 200 });
        this.slashFx(1, move.color, -120);
        for (const t of this.meleeHits(move.range)) this.hitTarget(t, move, dmgMul, magMul);
        break;
      }
      case "shield": {
        h.shieldUntil = now + (move.durationMs ?? 1500) * (session.practice ? 1.4 : 1);
        gameAudio.play("shield");
        burst(this, h.x, h.y - 70, { tint: [0xc6f3ff, 0xffffff], count: 16, speed: 260 });
        break;
      }
      case "heal": {
        const amount = Math.round(h.maxHp * (move.healPct ?? 0.2));
        h.hp = Math.min(h.maxHp, h.hp + amount);
        gameAudio.play("heal");
        burst(this, h.x, h.y - 60, { texture: "heart", tint: [0xff5f7e, 0xffd6f2], count: 10, speed: 200, gravityY: -200, lifespan: 900 });
        popup(this, h.x, h.y - 150, `+${amount}`, "#8fe36a", 34);
        break;
      }
      case "super":
        this.superMove(move);
        break;
    }
  }

  private superMove(move: MoveDef) {
    const h = this.hero;
    const cam = this.cameras.main;
    this.cinematic = true;
    h.magic = 0;
    gameAudio.play("super");
    this.syncPhysicsPause();
    const W = 1280;
    const top = this.add.rectangle(0, -90, W, 90, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
    const bot = this.add.rectangle(0, 720, W, 90, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
    this.tweens.add({ targets: top, y: 0, duration: 250 });
    this.tweens.add({ targets: bot, y: 630, duration: 250 });
    cam.zoomTo(1.15, 400);
    const title = this.add
      .text(640, 300, "Happily Ever After", { fontFamily: FONT, fontSize: "72px", fontStyle: "bold italic", color: "#ffe066", stroke: "#2b1a12", strokeThickness: 10 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(210)
      .setAlpha(0)
      .setScale(0.6);
    const sub = text(this, 640, 380, "...and they all lived happily ever after.", 30, "#fff6dc").setScrollFactor(0).setDepth(210).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 500, ease: "Back.Out" });
    this.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 300 });
    const sparkle = this.time.addEvent({
      delay: 120,
      repeat: 12,
      callback: () => burst(this, h.x + Phaser.Math.Between(-300, 300), h.y - Phaser.Math.Between(40, 300), { tint: [0xffe066, 0xffffff, 0xff9ff3], count: 8, speed: 200, gravityY: 0 }),
    });
    this.time.delayedCall(1600, () => {
      cam.flash(350, 255, 240, 200);
      cam.shake(400, move.shake);
      gameAudio.play("heavyHit");
      const view = cam.worldView;
      for (const t of this.targets()) {
        if (t.x < view.x - 100 || t.x > view.right + 100) continue;
        const isEnemy = (this.enemies as unknown as Hittable[]).includes(t);
        this.hitTarget(t, move, 1, 0, t.x >= h.x ? 1 : -1, isEnemy ? 999 : this.superBossDamage());
      }
    });
    this.time.delayedCall(2300, () => {
      sparkle.remove();
      this.tweens.add({ targets: [title, sub], alpha: 0, duration: 300, onComplete: () => (title.destroy(), sub.destroy()) });
      this.tweens.add({ targets: top, y: -90, duration: 300, onComplete: () => top.destroy() });
      this.tweens.add({ targets: bot, y: 720, duration: 300, onComplete: () => bot.destroy() });
      cam.zoomTo(1, 400);
      this.cinematic = false;
    });
  }

  /** Bosses take a fixed share instead of 999. */
  protected superBossDamage(): number {
    return 250;
  }

  // ---------------------------------------------------------------- frame
  update(_time: number, dt: number) {
    if (!this.hero?.active) return;
    const now = this.time.now;
    const h = this.hero;
    this.syncPhysicsPause();
    const frozen = this.isFrozen();

    let moving = false;
    if (!frozen && h.hp > 0) {
      const left = this.keys.LEFT.isDown || this.keys.A.isDown;
      const right = this.keys.RIGHT.isDown || this.keys.D.isDown;
      const jump = Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.UP) || Phaser.Input.Keyboard.JustDown(this.keys.W);
      if (now >= this.dashUntil) {
        const vx = (right ? 1 : 0) - (left ? 1 : 0);
        h.setVelocityX(vx * 330);
        if (vx) h.facing = vx > 0 ? 1 : -1;
        moving = vx !== 0;
      }
      if (jump && h.onGround) h.setVelocityY(-820);
    }
    if (h.x < this.bounds.left) h.x = this.bounds.left;
    if (h.x > this.bounds.right) h.x = this.bounds.right;
    h.tick(now, dt, moving);

    for (const e of this.enemies) {
      e.tick(now);
      // Once inside the arena, enemies stay where the hero can reach them.
      if (!e.alive) continue;
      if (e.x > this.bounds.left && e.x < this.bounds.right) e.entered = true;
      if (e.entered) e.x = Phaser.Math.Clamp(e.x, this.bounds.left - 10, this.bounds.right + 10);
    }
    this.enemies = this.enemies.filter((e) => e.active);
    this.tickProjectiles(now, dt, frozen);
    this.tickScene(now, dt);

    if (now - this.lastHudAt > 100) {
      this.lastHudAt = now;
      this.emitHud();
    }
    if (now - this.lastProgressAt > 250) this.emitProgress();
    if (now - this.lastFpsAt > 500) {
      this.lastFpsAt = now;
      EventBus.emit(EV.fps, this.game.loop.actualFps);
    }
  }

  protected emitHud() {
    const h = this.hero;
    const now = this.time.now;
    const state: HudState = {
      scene: this.scene.key,
      heroHp: h.hp,
      heroMaxHp: h.maxHp,
      magic: h.magic,
      combo: now - this.lastHitAt < 2500 ? this.comboHits : 0,
      shield: h.isShielded(now),
      ...this.hudExtra(),
    };
    EventBus.emit(EV.hud, state);
  }

  private tickProjectiles(now: number, dt: number, frozen: boolean) {
    const s = dt / 1000;
    for (const f of this.fireballs) {
      if (!frozen) f.img.x += f.dir * 900 * s;
      f.img.setRotation(Math.sin(now / 50) * 0.08);
      if (Math.random() < 0.5) burst(this, f.img.x - f.dir * 30, f.img.y, { tint: [0xff8a3d, 0xffd166], count: 1, speed: 60, lifespan: 300, scale: 0.6, gravityY: -100 });
      for (const t of this.targets()) {
        if (f.hit.has(t)) continue;
        if (Math.abs(t.x - f.img.x) < t.hitHalfWidth + 30 && f.img.y > t.y - t.hitHeight - 20 && f.img.y < t.y + 10) {
          f.hit.add(t);
          this.hitTarget(t, f.move, f.magMul, 1, f.dir);
        }
      }
      const view = this.cameras.main.worldView;
      if (now - f.born > 1500 || f.img.x < view.x - 100 || f.img.x > view.right + 100) {
        burst(this, f.img.x, f.img.y, { tint: [0xff8a3d, 0xffd166], count: 8, speed: 180 });
        f.img.destroy();
      }
    }
    this.fireballs = this.fireballs.filter((f) => f.img.active);

    for (const c of this.candies) {
      if (!frozen) {
        c.vy += 1100 * s;
        c.img.x += c.vx * s;
        c.img.y += c.vy * s;
        c.img.rotation += 8 * s;
      }
      const h = this.hero;
      if (Math.abs(c.img.x - h.x) < 40 && c.img.y > h.y - 130 && c.img.y < h.y) {
        this.heroHurt(c.damage, c.img.x, "Candy");
        burst(this, c.img.x, c.img.y, { tint: [0xff7eb6, 0xffffff], count: 10, speed: 200 });
        c.img.destroy();
      } else if (c.img.y >= GROUND_Y) {
        burst(this, c.img.x, GROUND_Y - 6, { tint: [0xff7eb6, 0xffffff], count: 8, speed: 160 });
        c.img.destroy();
      }
    }
    this.candies = this.candies.filter((c) => c.img.active);
  }

  // ---------------------------------------------------------------- end states
  protected defeat() {
    if (this.ended) return;
    this.ended = true;
    gameAudio.play("defeat");
    this.music?.stop();
    this.hero.setVelocity(-this.hero.facing * 200, -400);
    this.tweens.add({ targets: this.hero, angle: -this.hero.facing * 90, duration: 600 });
    this.time.delayedCall(1600, () => this.finish(false));
  }

  protected finish(victory: boolean) {
    this.cameras.main.fadeOut(500, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("End", { victory, from: this.scene.key });
    });
  }

  private cleanup() {
    this.unsubNote?.();
    this.unsubNote = null;
    this.music?.stop();
    this.music = null;
  }
}
