/**
 * Shared play for Level 1 and the boss (Magic Cat Academy style, with a guitar):
 *  - The bard walks on their own; big enemies block the path until slain.
 *  - Every enemy (and every candy the witch throws) shows a chord. Play it and
 *    everything whose next chord matches is hit. Wrong chords just fizzle.
 *  - Playing on the beat = Perfect = more magic. A full meter + the super chord
 *    = Happily Ever After. The fairy godmother brings the heal chord.
 */

import Phaser from "phaser";
import { GRADE_MAGIC, judge, type Grade } from "@/lib/combat/rhythm";
import { SYMBOL_SETS, chordMidis, enemyPool, matches, playedLabel, randomSymbols, symbolCountFor, symbolKind } from "@/lib/combat/spells";
import { gameAudio, type SfxName } from "@/lib/game-audio/audio";
import type { SongClock } from "@/lib/game-audio/music";
import { getNoteInput, keyFor } from "@/lib/input/noteInput";
import type { NoteEvent } from "@/lib/input/types";
import { ENEMY_DEFS, Enemy, type EnemyHost, type EnemyKind, type FoeMods } from "../entities/Enemy";
import { Hero } from "../entities/Hero";
import { EventBus, onBus } from "../EventBus";
import { EV, type HeardEntry, type HudState } from "../events";
import { FONT, GROUND_Y, burst, gradePopup, popup, text } from "../fx";
import { newStats, session } from "../state";

/** Anything a chord can hit: enemies, candies, the boss, his wind gust... */
export interface SymbolTarget {
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
  readonly next: string | undefined;
  /** Every symbol it takes right now, in any order (default: just `next`). */
  readonly wants?: readonly string[];
  readonly hitHeight: number;
  /** One matching chord landed: `symbol` is which of its symbols was played. */
  strike(now: number, grade: Grade | null, symbol: string): { slain: boolean; label: string };
}

/** Something a caster threw: candy, fireball, riddle, laser bolt, song note. */
interface Candy {
  img: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  symbol: string;
  damage: number;
  name: string;
  straight: boolean;
  spin: boolean;
  done: boolean;
}

interface Fairy {
  img: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Container;
  until: number;
  done: boolean;
}

/** A gold chord chip with an optional key hint, used over enemies, candies, fairies. */
export function symbolChip(scene: Phaser.Scene, symbol: string, hint: string, size: "big" | "small" = "big"): Phaser.GameObjects.Container {
  const big = size === "big";
  const t = scene.add.text(0, 0, symbol, { fontFamily: FONT, fontSize: big ? "30px" : "22px", fontStyle: "bold", color: "#2b1a12" }).setOrigin(0.5);
  const w = Math.max(big ? 54 : 42, t.width + 20);
  const h = big ? 46 : 36;
  const g = scene.add.graphics();
  g.fillStyle(0xffd25e, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.lineStyle(4, 0x2b1a12, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
  const parts: Phaser.GameObjects.GameObject[] = [g, t];
  if (hint) {
    parts.push(
      scene.add.text(0, h / 2 + 12, hint, { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#fff6dc", stroke: "#2b1a12", strokeThickness: 4 }).setOrigin(0.5),
    );
  }
  return scene.add.container(0, 0, parts).setDepth(46);
}

export abstract class FightScene extends Phaser.Scene implements EnemyHost {
  hero!: Hero;
  enemies: Enemy[] = [];
  protected music: SongClock | null = null;
  protected worldWidth = 1280;
  /** Auto-walk speed (px/s); 0 = stand still (boss arena). */
  protected walkSpeed = 0;
  /** How far into the level we are: controls which chords appear. */
  protected stage = 0;
  /** The level's difficulty for every foe. */
  protected foeMods: FoeMods = { speed: 1, damage: 1 };
  /** Multiplies the chance a foe needs extra chords. */
  protected toughness = 1;
  protected cinematic = false;
  protected ended = false;
  protected ground!: Phaser.GameObjects.Rectangle;
  private unsubNote: (() => void) | null = null;
  private frozenUntil = 0;
  private dashUntil = 0;
  private streak = 0;
  private lastHitAt = 0;
  private lastHudAt = 0;
  private lastFpsAt = 0;
  private candies: Candy[] = [];
  private fairy: Fairy | null = null;
  private lastFairyAt = -1e9;
  private superHintShown = false;

  // ---------------------------------------------------------------- subclass hooks
  protected abstract buildWorld(): void;
  protected abstract heroStartX(): number;
  protected tickScene(_now: number, _dt: number): void {}
  /** Boss parries: return a label if the input was used up. */
  protected interceptNote(_ev: NoteEvent, _grade: Grade | null): string | null {
    return null;
  }
  /** Extra things chords can hit (the boss, his wind). */
  protected extraTargets(): SymbolTarget[] {
    return [];
  }
  protected hudExtra(): Partial<HudState> {
    return {};
  }
  /** Set pieces that stop the walk (e.g. waiting for a song to be picked). */
  protected haltedByScene(): boolean {
    return false;
  }
  /** What the super does to a boss. */
  protected onSuperImpact(): void {}
  /** Symbols coming at the bard on a beat (the boss's howls), soonest first. */
  protected upcomingSymbols(): string[] {
    return [];
  }

  get symbols() {
    return SYMBOL_SETS[session.playMode];
  }

  create() {
    this.enemies = [];
    this.candies = [];
    this.fairy = null;
    this.cinematic = false;
    this.ended = false;
    this.streak = 0;
    this.lastFairyAt = -1e9;
    this.superHintShown = false;
    session.stats ??= newStats();

    this.physics.world.setBounds(0, -400, this.worldWidth, 720 + 800);
    this.cameras.main.setBounds(0, 0, this.worldWidth, 720);
    this.buildWorld();

    this.ground = this.add.rectangle(this.worldWidth / 2, GROUND_Y + 60, this.worldWidth, 120, 0x000000, 0).setVisible(false);
    this.physics.add.existing(this.ground, true);

    this.hero = new Hero(this, this.heroStartX(), session.heroMaxHp);
    this.physics.add.collider(this.hero, this.ground);

    this.unsubNote = getNoteInput().on(this.onNote);
    onBus(this, EV.setPaused, this.onPaused as (...a: never[]) => void);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.cameras.main.fadeIn(400, 20, 12, 8);
    EventBus.emit(EV.sceneReady, this);
    // Paused while the level was changing (tab hidden, Esc)? Start paused, like the menu says.
    if (session.paused) this.time.delayedCall(0, () => session.paused && this.onPaused(true));
  }

  // ---------------------------------------------------------------- EnemyHost
  isFrozen(): boolean {
    return this.cinematic || this.time.now < this.frozenUntil || this.ended;
  }

  sfx(name: string) {
    gameAudio.play(name as SfxName);
  }

  /** Key hints only for keyboard players; guitarists just see the chord. */
  keyHint(symbol: string): string {
    if (session.mode !== "keyboard") return "";
    const k = keyFor(symbol, symbolKind(session.playMode));
    return k ? `key ${k}` : "";
  }

  /** How many chords a new foe of this kind needs (tougher foes, more often in harder levels). */
  protected chordsFor(kind: EnemyKind): number {
    return symbolCountFor(ENEMY_DEFS[kind].symbolCount, this.stage, Math.random, this.toughness);
  }

  addEnemy(kind: EnemyKind, x: number, symbols?: string[]): Enemy {
    const e = new Enemy(this, kind, x, this, symbols ?? randomSymbols(session.playMode, this.stage, this.chordsFor(kind)), this.foeMods);
    this.physics.add.collider(e, this.ground);
    this.enemies.push(e);
    return e;
  }

  throwProjectile(from: Enemy) {
    const p = from.def.ranged?.projectile;
    if (!p) return;
    gameAudio.play("throw");
    const pool = enemyPool(session.playMode, this.stage);
    const symbol = pool[Math.floor(Math.random() * pool.length)];
    const sx = from.x + (from.flipX ? -1 : 1) * Math.min(90, from.def.body[0] * 0.35);
    const sy = from.y - from.def.body[1] * 0.6;
    const img = this.add.image(sx, sy, p.texture).setDepth(26).setScale(p.scale);
    const badge = symbolChip(this, symbol, this.keyHint(symbol), "small");
    // Slow enough to read and strum; a little quicker in harder levels.
    const flight = 1.8 / Math.sqrt(this.foeMods.speed);
    const tx = this.hero.x + 10;
    const ty = GROUND_Y - 80;
    const vx = (tx - sx) / flight;
    const vy = p.straight ? (ty - sy) / flight : (ty - sy - 0.5 * 500 * flight * flight) / flight;
    const damage = Math.round(6 * this.foeMods.damage);
    this.candies.push({ img, badge, vx, vy, symbol, damage, name: p.name, straight: !!p.straight, spin: !!p.spin, done: false });
  }

  heroHurt(amount: number, fromX: number, source: string) {
    const now = this.time.now;
    const hero = this.hero;
    if (this.ended || this.cinematic || hero.hp <= 0 || amount <= 0) return;
    if (now < hero.invulnUntil) return;
    hero.hp = Math.max(0, hero.hp - amount);
    hero.invulnUntil = now + 700;
    hero.hurtUntil = now + 220;
    hero.setVelocity(-260, -240);
    this.dashUntil = now + 220;
    popup(this, hero.x, hero.y - 150, `-${amount}`, "#ff8a7a", 30, 600);
    gameAudio.play("hurt");
    this.cameras.main.shake(120, 0.006);
    this.streak = 0;
    void source;
    void fromX;
    if (hero.hp <= 0) this.defeat();
    else if (hero.hp <= hero.maxHp * 0.45) this.spawnFairy(true);
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
    if (grade === "perfect") stats.perfects++;
    // The backing moves to what you just played, so it blends in.
    this.music?.follow?.(playedLabel(ev));

    const parried = this.interceptNote(ev, grade);
    if (parried) {
      this.emitHeard({ ev, grade, result: parried, hit: true });
      this.gradeFx(grade);
      return;
    }
    if (this.cinematic) return;

    const set = this.symbols;
    const mode = session.playMode;
    const practice = session.practice;

    if (this.hero.magic >= 100 && matches(ev, set.super, mode, practice)) {
      this.playFeedback(ev);
      this.superMove();
      this.emitHeard({ ev, grade, result: "Happily Ever After!", hit: true });
      return;
    }
    if (this.fairy && !this.fairy.done && matches(ev, set.heal, mode, practice)) {
      this.playFeedback(ev);
      this.healFromFairy();
      this.emitHeard({ ev, grade, result: "Healed!", hit: true });
      return;
    }

    const view = this.cameras.main.worldView;
    const visible = (t: SymbolTarget) => t.x < view.right - 10 && t.x > view.x - 40;
    // A foe with several chords takes them in any order.
    const hits = this.allTargets().flatMap((t) => {
      if (!t.alive || !t.next || !visible(t)) return [];
      const symbol = (t.wants ?? [t.next]).find((s) => matches(ev, s, mode, practice));
      return symbol ? [{ t, symbol }] : [];
    });
    if (!hits.length) {
      this.fizzle(ev);
      stats.misses++;
      this.emitHeard({ ev, grade, result: "no match", hit: false });
      return;
    }

    this.playFeedback(ev);
    const now = this.time.now;
    this.hero.actionUntil = now + 220;
    const labels: string[] = [];
    let slain = 0;
    for (const { t, symbol } of hits) {
      this.bolt(t);
      const r = t.strike(now, grade, symbol);
      labels.push(r.label);
      if (r.slain) slain++;
      this.hero.addMagic(6 * (grade ? GRADE_MAGIC[grade] : 1));
      this.streak = now - this.lastHitAt < 4000 ? this.streak + 1 : 1;
      this.lastHitAt = now;
    }
    stats.slain += slain;
    stats.maxCombo = Math.max(stats.maxCombo, this.streak);
    if (slain) {
      gameAudio.play("poof");
      this.hitStop(50);
    }
    this.gradeFx(grade);
    const unique = [...new Set(labels)];
    this.emitHeard({ ev, grade, result: unique.length === 1 && labels.length > 1 ? `${unique[0]} ×${labels.length}` : unique.join(", "), hit: true });
    if (this.hero.magic >= 100 && !this.superHintShown) {
      this.superHintShown = true;
      popup(this, this.hero.x, this.hero.y - 240, `Magic full! Play ${set.super} for Happily Ever After`, "#ffe066", 24, 2200).setDepth(70);
    }
  };

  private gradeFx(grade: Grade | null) {
    if (!grade) return;
    gradePopup(this, this.hero.x, this.hero.y - 190, grade);
    if (grade === "perfect") gameAudio.play("perfect");
  }

  private emitHeard(h: HeardEntry) {
    EventBus.emit(EV.heard, h);
  }

  /** Keyboard players hear the chord they "played"; guitarists hear their guitar. */
  private playFeedback(ev: NoteEvent) {
    if (ev.source !== "keyboard") return;
    const midis = ev.type === "chord" && ev.chord ? chordMidis(ev.chord) : [ev.midi ?? 52];
    gameAudio.pluck(midis, { gain: 0.45, strumMs: 14 });
  }

  private fizzle(ev: NoteEvent) {
    const h = this.hero;
    burst(this, h.x + 40, h.y - 90, { tint: [0xbfbfbf, 0xffffff], count: 5, speed: 90, gravityY: 0, scale: 0.5 });
    popup(this, h.x + 30, h.y - 170, `${playedLabel(ev)}?`, "#d9d2c0", 22, 450);
    this.playFeedback(ev);
  }

  /** A magic bolt from the lute to a target. */
  private bolt(t: SymbolTarget) {
    const h = this.hero;
    const sx = h.x + 45;
    const sy = h.y - 85;
    const ty = t.y - t.hitHeight * 0.6;
    const img = this.add.image(sx, sy, "spark").setDepth(48).setTint(0xffe066).setScale(1.3);
    this.tweens.add({
      targets: img,
      x: t.x,
      y: ty,
      angle: 360,
      duration: 130,
      ease: "Quad.In",
      onComplete: () => {
        img.destroy();
        burst(this, t.x, ty, { tint: [0xffe066, 0xffffff, 0xff9ff3], count: 12, speed: 260 });
        gameAudio.play("hit");
      },
    });
  }

  private allTargets(): SymbolTarget[] {
    const list: SymbolTarget[] = this.enemies
      .filter((e) => e.alive)
      .map((e) => ({
        get x() {
          return e.x;
        },
        get y() {
          return e.y;
        },
        get alive() {
          return e.alive;
        },
        get next() {
          return e.next;
        },
        get wants() {
          return e.symbols;
        },
        hitHeight: e.hitHeight,
        strike: (now: number, _grade: Grade | null, symbol: string) => {
          const slain = e.hit(now, symbol);
          const name = e.def.name.replace(/^The /, "").toLowerCase();
          const v = e.def.verbs;
          return { slain, label: slain ? (v?.slain ?? `slew the ${name}`) : (v?.hit ?? `hit the ${name}`) };
        },
      }));
    for (const c of this.candies) {
      if (c.done) continue;
      list.push({
        get x() {
          return c.img.x;
        },
        get y() {
          return c.img.y + 20;
        },
        get alive() {
          return !c.done;
        },
        next: c.symbol,
        hitHeight: 40,
        strike: () => {
          this.removeCandy(c, true);
          return { slain: false, label: `popped the ${c.name}` };
        },
      });
    }
    return list.concat(this.extraTargets());
  }

  private hitStop(ms: number) {
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

  // ---------------------------------------------------------------- fairy godmother (heal)
  protected spawnFairy(lowHealth = false) {
    const now = this.time.now;
    if (this.fairy || this.ended || now - this.lastFairyAt < (lowHealth ? 15000 : 8000)) return;
    this.lastFairyAt = now;
    const h = this.hero;
    const img = this.add.image(h.x + 240, GROUND_Y - 290, "fairy").setDepth(44).setAlpha(0);
    this.tweens.add({ targets: img, alpha: 1, duration: 300 });
    const sym = this.symbols.heal;
    const badge = symbolChip(this, sym, this.keyHint(sym), "small");
    this.fairy = { img, badge, until: now + 8000, done: false };
    popup(this, h.x + 240, GROUND_Y - 390, `The fairy godmother! Play ${sym} to heal`, "#ffd6f2", 22, 2200).setDepth(70);
    gameAudio.play("heal");
  }

  private healFromFairy() {
    const f = this.fairy;
    if (!f) return;
    const h = this.hero;
    const amount = Math.round(h.maxHp * 0.25);
    h.hp = Math.min(h.maxHp, h.hp + amount);
    gameAudio.play("heal");
    burst(this, h.x, h.y - 60, { texture: "heart", tint: [0xff5f7e, 0xffd6f2], count: 12, speed: 220, gravityY: -200, lifespan: 900 });
    popup(this, h.x, h.y - 160, `+${amount}`, "#8fe36a", 34);
    this.dismissFairy();
  }

  private dismissFairy() {
    const f = this.fairy;
    if (!f) return;
    f.done = true;
    f.badge.destroy();
    this.tweens.add({ targets: f.img, y: f.img.y - 200, alpha: 0, duration: 600, onComplete: () => f.img.destroy() });
    this.fairy = null;
  }

  // ---------------------------------------------------------------- super
  private superMove() {
    const h = this.hero;
    const cam = this.cameras.main;
    this.cinematic = true;
    h.magic = 0;
    this.superHintShown = false;
    gameAudio.play("super");
    this.syncPhysicsPause();
    const top = this.add.rectangle(0, -90, 1280, 90, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
    const bot = this.add.rectangle(0, 720, 1280, 90, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
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
      callback: () => burst(this, h.x + Phaser.Math.Between(-300, 600), h.y - Phaser.Math.Between(40, 300), { tint: [0xffe066, 0xffffff, 0xff9ff3], count: 8, speed: 200, gravityY: 0 }),
    });
    this.time.delayedCall(1600, () => {
      cam.flash(350, 255, 240, 200);
      cam.shake(400, 0.02);
      gameAudio.play("heavyHit");
      const view = cam.worldView;
      for (const e of this.enemies) {
        if (e.alive && e.x < view.right + 80) {
          e.vanish();
          session.stats!.slain++;
        }
      }
      for (const c of this.candies) if (!c.done) this.removeCandy(c, true);
      this.onSuperImpact();
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

  // ---------------------------------------------------------------- frame
  update(_time: number, dt: number) {
    if (!this.hero?.active) return;
    const now = this.time.now;
    const h = this.hero;
    this.syncPhysicsPause();
    const frozen = this.isFrozen();

    // Auto-walk until something blocks the path.
    let blocked = this.haltedByScene() || this.walkSpeed <= 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.x - h.x;
      if (d > -40 && d < e.def.haltDistance) {
        blocked = true;
        break;
      }
    }
    if (!frozen && h.hp > 0 && now >= this.dashUntil) h.setVelocityX(blocked ? 0 : this.walkSpeed);
    h.facing = 1;
    if (h.x < 40) h.x = 40;
    if (h.x > this.worldWidth - 40) h.x = this.worldWidth - 40;
    h.tick(now, dt, !blocked && !frozen && this.walkSpeed > 0);

    for (const e of this.enemies) {
      e.tick(now);
      e.animate(now);
    }
    this.stackBadges();
    this.enemies = this.enemies.filter((e) => e.active);
    this.tickCandies(dt, frozen);
    this.tickFairy(now);
    this.tickScene(now, dt);

    if (now - this.lastHudAt > 100) {
      this.lastHudAt = now;
      this.emitHud();
    }
    if (now - this.lastFpsAt > 500) {
      this.lastFpsAt = now;
      EventBus.emit(EV.fps, this.game.loop.actualFps);
    }
  }

  /** Foes walking close together: stack their chord badges so each stays readable. */
  private stackBadges() {
    const placed: { x: number; y: number; hw: number }[] = [];
    const alive = this.enemies.filter((e) => e.alive).sort((a, b) => a.x - b.x);
    for (const e of alive) {
      const hw = Math.max(30, e.badgeHalfWidth);
      let lift = 0;
      for (let guard = 0; guard < 4; guard++) {
        const y = e.badgeY - lift;
        const hit = placed.some((p) => Math.abs(p.x - e.x) < p.hw + hw + 6 && Math.abs(p.y - y) < 52);
        if (!hit) break;
        lift += 56;
      }
      e.badgeLift = lift;
      placed.push({ x: e.x, y: e.badgeY - lift, hw });
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
      combo: now - this.lastHitAt < 4000 ? this.streak : 0,
      superSymbol: this.symbols.super,
      wanted: this.wantedSymbols(),
      playMode: session.playMode,
      ...this.hudExtra(),
    };
    EventBus.emit(EV.hud, state);
  }

  /** What the chord helper should show: on-screen foes' chords (nearest first), then heal/super. */
  private wantedSymbols(): NonNullable<HudState["wanted"]> {
    const view = this.cameras.main.worldView;
    const out: NonNullable<HudState["wanted"]> = [];
    const seen = new Set<string>();
    const targets = this.allTargets()
      .filter((t) => t.alive && t.next && t.x < view.right + 40 && t.x > view.x - 40)
      .sort((a, b) => a.x - b.x);
    for (const t of targets) {
      for (const symbol of t.wants ?? [t.next!]) {
        if (seen.has(symbol)) continue;
        seen.add(symbol);
        out.push({ symbol, role: "foe" });
      }
    }
    const howl = this.upcomingSymbols()[0];
    if (howl) {
      const at = out.findIndex((w) => w.symbol === howl);
      if (at >= 0) out.splice(at, 1);
      out.unshift({ symbol: howl, role: "howl" });
    }
    if (this.fairy && !this.fairy.done) out.unshift({ symbol: this.symbols.heal, role: "heal" });
    if (this.hero.magic >= 100) out.unshift({ symbol: this.symbols.super, role: "super" });
    return out.slice(0, 3);
  }

  private removeCandy(c: Candy, popped: boolean) {
    if (c.done) return;
    c.done = true;
    burst(this, c.img.x, c.img.y, { tint: popped ? [0xffe066, 0xff7eb6, 0xffffff] : [0xff7eb6, 0xffffff], count: popped ? 14 : 8, speed: 220 });
    c.img.destroy();
    c.badge.destroy();
  }

  private tickCandies(dt: number, frozen: boolean) {
    const s = dt / 1000;
    const h = this.hero;
    for (const c of this.candies) {
      if (c.done) continue;
      if (!frozen) {
        if (!c.straight) c.vy += 500 * s;
        c.img.x += c.vx * s;
        c.img.y += c.vy * s;
        if (c.spin) c.img.rotation += 5 * s;
        else c.img.rotation = Math.atan2(c.vy, c.vx); // the bright head leads
      }
      c.badge.setPosition(c.img.x, c.img.y - 46);
      if (Math.abs(c.img.x - h.x) < 45 && c.img.y > h.y - 140 && c.img.y < h.y) {
        this.heroHurt(c.damage, c.img.x, c.name);
        this.removeCandy(c, false);
      } else if (c.img.y >= GROUND_Y) this.removeCandy(c, false);
    }
    this.candies = this.candies.filter((c) => !c.done);
  }

  private tickFairy(now: number) {
    const f = this.fairy;
    if (!f) return;
    const h = this.hero;
    f.img.x = Phaser.Math.Linear(f.img.x, h.x + 230, 0.05);
    f.img.y = GROUND_Y - 290 + Math.sin(now / 300) * 14;
    f.badge.setPosition(f.img.x, f.img.y - 70);
    if (Math.random() < 0.15) burst(this, f.img.x, f.img.y, { tint: [0xffd6f2, 0xffffff], count: 1, speed: 40, gravityY: 60, scale: 0.4, lifespan: 600 });
    if (now > f.until) this.dismissFairy();
  }

  // ---------------------------------------------------------------- end states
  protected defeat() {
    if (this.ended) return;
    this.ended = true;
    gameAudio.play("defeat");
    this.music?.stop();
    this.hero.setVelocity(-200, -400);
    this.tweens.add({ targets: this.hero, angle: -90, duration: 600 });
    this.time.delayedCall(1600, () => this.finish(false));
  }

  protected finish(victory: boolean) {
    this.cameras.main.fadeOut(500, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("End", { victory, from: this.scene.key, level: session.level });
    });
  }

  private cleanup() {
    this.unsubNote?.();
    this.unsubNote = null;
    this.music?.stop();
    this.music = null;
  }
}
