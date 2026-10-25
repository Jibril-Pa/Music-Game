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
import type { DetectorDiag } from "@/lib/input/detector";
import { getNoteInput, keyFor } from "@/lib/input/noteInput";
import type { NoteEvent } from "@/lib/input/types";
import { ENEMY_DEFS, Enemy, type EnemyHost, type EnemyKind, type FoeMods } from "../entities/Enemy";
import { HeardChip, type HeardKind, type HeardTone } from "../entities/HeardChip";
import { Hero } from "../entities/Hero";
import { EventBus, onBus } from "../EventBus";
import { EV, type HeardEntry, type HudState } from "../events";
import { C, FONT, GROUND_Y, burst, chordPlate, flash, headline, nudge, popup, reducedMotion, shake, text, zoomTo } from "../fx";
import { newStats, session } from "../state";

/** In an arena (heroHomeX), the bard steps back to their post this long after a knockback ends (the hit reads first)... */
const HOME_BEAT_MS = 300;
/** ...at up to this speed (px/s), slowing over the last HOME_SPEED / HOME_EASE px to HOME_MIN_SPEED. */
const HOME_SPEED = 160;
const HOME_EASE = 8;
const HOME_MIN_SPEED = 40;
/** Plates stacked next to the plate to read keep this gap (px), so its beat frame has room to close. */
const FOCUS_GAP = 22;
/** A muted mic (OS or interface mute) delivers digital silence: hop RMS exactly 0. Any working mic's own
 *  noise reads far above this (one 16-bit LSB in a 512-sample hop is already 1.35e-6). */
const SILENT_RMS = 1e-6;
/** After this long with nothing but silence, the bard says the ear hears nothing (if something waits to be played)... */
const SILENT_MS = 8000;
/** ...and again at most this often; the line is long, so it holds longer than a "?". */
const SILENT_REPEAT_MS = 20000;
const SILENT_HOLD_MS = 2500;

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

/** A boss parry: the bubble's line, how it landed on the howl, how far off it was (ms, negative = early), and the howl's symbol. */
export interface Parry {
  label: string;
  grade: Grade;
  offsetMs: number;
  symbol: string;
}

/** The chord plate the player should be reading: the nearest foe's, or the boss's own chip. */
export interface FocusPlate {
  readonly bounds: Phaser.Geom.Rectangle;
  /** A little "no" shake after a wrong chord. */
  nudge(): void;
}

/** A chip's plate as a FocusPlate (its size, keycap included, is stored by symbolChip). */
export function chipPlate(scene: Phaser.Scene, chip: Phaser.GameObjects.Container): FocusPlate {
  return {
    get bounds() {
      const w = (chip.getData("w") as number) * chip.scaleX;
      const h = (chip.getData("h") as number) * chip.scaleY;
      const top = (chip.getData("top") as number) * chip.scaleY;
      return new Phaser.Geom.Rectangle(chip.x - w / 2, chip.y + top, w, h);
    },
    nudge: () => nudge(scene, chip),
  };
}

/** A hit's timing in words: "Perfect!", "Good", "Early" or "Late" ("" when there is no beat to judge). */
function timingWord(grade: Grade | null, offset: number | null): string {
  if (!grade || offset === null) return "";
  if (grade === "perfect") return "Perfect!";
  if (grade === "good") return "Good";
  return offset < 0 ? "Early" : "Late";
}

/** A one-chord gold plate (with its keycap for keyboard players): candies, the fairy, howls, gusts, the wolf. */
export function symbolChip(scene: Phaser.Scene, symbol: string, key: string, size: "big" | "small" = "big"): Phaser.GameObjects.Container {
  const plate = chordPlate(scene, [symbol], [key], size);
  const below = plate.keycaps ? (size === "big" ? 14 : 10) : 0;
  return scene.add
    .container(0, 0, plate.parts)
    .setDepth(46)
    .setData({ w: plate.w, h: plate.h + below, top: -plate.h / 2 });
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
  /** The bard's speech bubble: what the ear heard. */
  private heardChip!: HeardChip;
  /** The gold frame that closes on the focus plate on every beat. */
  private beatFrame!: Phaser.GameObjects.Graphics;
  private unsubDiag: (() => void) | null = null;
  /** The detector's "ignored sounds" count at the last diag (-1 = none yet). */
  private lastIgnored = -1;
  /** performance.now() of the last NoteEvent and of the last "?" bubble. */
  private lastNoteAt = -1e9;
  private lastUnclearAt = -1e9;
  /** performance.now() since the mic has delivered only silence (null: it hears something), and of the last "hears nothing". */
  private silentSince: number | null = null;
  private lastSilentAt = -1e9;

  // ---------------------------------------------------------------- subclass hooks
  protected abstract buildWorld(): void;
  protected abstract heroStartX(): number;
  protected tickScene(_now: number, _dt: number): void {}
  /** Boss parries: the parry if the input was used up on a howl. */
  protected interceptNote(_ev: NoteEvent): Parry | null {
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
  /** The plate to read when no foe is in view (the boss: the wolf's chip). */
  protected focusExtra(): FocusPlate | null {
    return null;
  }
  /** The next howl's chip, if one is coming (it gets the nudge after a wrong chord). */
  protected howlPlate(): FocusPlate | null {
    return null;
  }
  /** Where the bard stands in an arena (they never walk there): knocked back, they step back to it. null = walking level. */
  protected heroHomeX(): number | null {
    return null;
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
    this.heardChip = new HeardChip(this);
    this.beatFrame = this.add.graphics().setDepth(47);
    this.lastIgnored = -1;
    this.lastNoteAt = -1e9;
    this.lastUnclearAt = -1e9;
    this.silentSince = null;
    this.lastSilentAt = -1e9;

    this.unsubNote = getNoteInput().on(this.onNote);
    this.unsubDiag = getNoteInput().onDiag(this.onDiag);
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

  /** The key that plays a symbol ("1", "Z"), for keyboard players only; guitarists just see the chord. */
  keyHint(symbol: string): string {
    if (session.mode !== "keyboard") return "";
    return keyFor(symbol, symbolKind(session.playMode)) ?? "";
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
    popup(this, this.besideHero(), hero.y - 118, `-${amount}`, "#ff8a7a", 30, 600);
    gameAudio.play("hurt");
    shake(this, 120, 0.006);
    this.streak = 0;
    void source;
    void fromX;
    if (hero.hp <= 0) this.defeat();
    else if (hero.hp <= hero.maxHp * 0.45) this.spawnFairy(true);
  }

  /** Where a number beside the bard pops: to their left, clear of the speech bubble (to their right near the screen's left edge). */
  private besideHero(): number {
    const x = this.hero.x - 52;
    return x < this.cameras.main.worldView.x + 40 ? this.hero.x + 52 : x;
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
    // The bard strums on every input: hits, misses, parries, the heal and the super.
    this.hero.actionUntil = this.time.now + 220;
    this.lastNoteAt = performance.now();
    const stats = session.stats!;
    const offset = this.music?.offsetToNearestBeat(ev.time) ?? null;
    const beatGrade = this.music ? judge(offset, session.practice) : null;
    stats.notesHeard++;
    // The backing moves to what you just played, so it blends in.
    this.music?.follow?.(playedLabel(ev));

    const parry = this.interceptNote(ev);
    if (parry) {
      stats.hits++;
      if (parry.grade === "perfect") {
        stats.perfects++;
        gameAudio.play("perfect");
      }
      this.answer(
        { ev, grade: parry.grade, result: "sent the howl back", hit: true, line: parry.label, wanted: [parry.symbol], offsetMs: parry.offsetMs },
        parry.grade === "perfect" ? "perfect" : "hit",
      );
      return;
    }
    if (this.cinematic) return;

    const set = this.symbols;
    const mode = session.playMode;
    const practice = session.practice;

    if (this.hero.magic >= 100 && matches(ev, set.super, mode, practice)) {
      this.playFeedback(ev);
      this.countHit(beatGrade);
      this.superMove();
      // The super is its own moment (no bubble over its title): only the Ear logs it.
      this.emitHeard({ ev, grade: beatGrade, result: "Happily Ever After!", hit: true, line: "Happily Ever After!", wanted: [set.super], offsetMs: offset });
      return;
    }
    if (this.fairy && !this.fairy.done && matches(ev, set.heal, mode, practice)) {
      this.playFeedback(ev);
      this.countHit(beatGrade);
      this.healFromFairy();
      this.answer({ ev, grade: beatGrade, result: "Healed!", hit: true, line: "Healed!", wanted: [set.heal], offsetMs: offset }, "hit", "heal");
      return;
    }

    const view = this.cameras.main.worldView;
    const visible = (t: SymbolTarget) => t.x < view.right - 10 && t.x > view.x - 40;
    const targets = this.allTargets().filter((t) => t.alive && t.next && visible(t));
    // A foe with several chords takes them in any order.
    const hits = targets.flatMap((t) => {
      const symbol = (t.wants ?? [t.next!]).find((s) => matches(ev, s, mode, practice));
      return symbol ? [{ t, symbol }] : [];
    });
    if (!hits.length) {
      this.fizzle(ev);
      // A miss is never graded, and only counts when there was something to hit.
      if (targets.length || this.upcomingSymbols().length) stats.misses++;
      const need = this.neededNow(targets);
      // The plate that wanted something else shakes its head.
      (this.howlPlate() ?? this.focusTarget())?.nudge();
      this.answer(
        {
          ev,
          grade: null,
          hit: false,
          result: need.length ? `needs ${need[0]}` : "nothing to hit",
          line: need.length ? `needs ${need.slice(0, 2).join(" or ")}` : "",
          wanted: need,
          offsetMs: offset,
        },
        need.length ? "miss" : "neutral",
      );
      return;
    }

    this.playFeedback(ev);
    this.countHit(beatGrade);
    const now = this.time.now;
    const labels: string[] = [];
    let slain = 0;
    for (const { t, symbol } of hits) {
      this.bolt(t);
      const r = t.strike(now, beatGrade, symbol);
      labels.push(r.label);
      if (r.slain) slain++;
      this.hero.addMagic(6 * (beatGrade ? GRADE_MAGIC[beatGrade] : 1));
      this.streak = now - this.lastHitAt < 4000 ? this.streak + 1 : 1;
      this.lastHitAt = now;
    }
    stats.slain += slain;
    stats.maxCombo = Math.max(stats.maxCombo, this.streak);
    if (slain) {
      gameAudio.play("poof");
      this.hitStop(50);
    }
    if (beatGrade === "perfect") gameAudio.play("perfect");
    const unique = [...new Set(labels)];
    this.answer(
      {
        ev,
        grade: beatGrade,
        result: unique.length === 1 && labels.length > 1 ? `${unique[0]} ×${labels.length}` : unique.join(", "),
        hit: true,
        line: timingWord(beatGrade, offset),
        wanted: [...new Set(hits.map((h) => h.symbol))],
        offsetMs: offset,
      },
      beatGrade === "perfect" ? "perfect" : "hit",
    );
    if (this.hero.magic >= 100 && !this.superHintShown) {
      this.superHintShown = true;
      headline(this, "Magic full!", { sub: `Play ${set.super} for Happily Ever After`, tone: "super", hold: 2200 });
    }
  };

  /** Every input's answer: the bard's speech bubble (none over the super's title), and the same entry for the Ear. */
  private answer(h: HeardEntry, kind: HeardKind, tone?: HeardTone) {
    if (!this.cinematic) this.heardChip.show(kind, playedLabel(h.ev), h.line ?? "", tone);
    this.emitHeard(h);
  }

  /**
   * What the ear can't name, said by the bard while something waits to be played. Reads the
   * detector's diagnostics; its logic is untouched.
   *  - "?" for a strum it heard but couldn't name (headphones only).
   *  - "?" and "the ear hears nothing" when a muted mic has sent only silence for SILENT_MS.
   */
  private onDiag = (d: DetectorDiag) => {
    const input = getNoteInput();
    const now = performance.now();
    this.checkSilence(d.rms, input.speakerMode, now);
    const prev = this.lastIgnored;
    this.lastIgnored = d.ignored;
    // The first sample, or a mic restart (the count starts over).
    if (prev < 0 || d.ignored <= prev) return;
    // With laptop speakers the music's own notes would trip it.
    if (!input.micOn || input.speakerMode) return;
    if (now - this.lastNoteAt < 450 || now - this.lastUnclearAt < 1500) return;
    if (d.rms < Math.max(0.015, 3 * d.noiseFloor)) return;
    if (!this.waitingForInput()) return;
    this.lastUnclearAt = now;
    this.hero.actionUntil = this.time.now + 220;
    this.heardChip.show("unclear", "?", "strum again, let it ring");
  };

  /**
   * Mic mode: digital silence (an OS or interface mute) for SILENT_MS while something waits, then at
   * most every SILENT_REPEAT_MS. With laptop speakers, whose echo canceller can bring a working mic
   * very low, only an exact 0 counts.
   */
  private checkSilence(rms: number, speakers: boolean, now: number) {
    if (speakers ? rms !== 0 : rms >= SILENT_RMS) {
      this.silentSince = null;
      return;
    }
    this.silentSince ??= now;
    if (session.mode !== "mic" || !getNoteInput().micOn) return;
    if (now - this.silentSince < SILENT_MS || now - this.lastSilentAt < SILENT_REPEAT_MS || !this.waitingForInput()) return;
    this.lastSilentAt = now;
    this.heardChip.show("unclear", "?", "the ear hears nothing: check your mic", undefined, SILENT_HOLD_MS);
  }

  /** In play, with something to play: a foe's (or the wolf's) chord, or a howl on its way. */
  private waitingForInput(): boolean {
    if (session.paused || this.ended || this.cinematic || !this.hero?.active || this.scene.isPaused() || !this.scene.isActive()) return false;
    return !!this.focusTarget() || this.upcomingSymbols().length > 0;
  }

  /** One input that hit something: a hit, and a Perfect only when it landed on the beat. */
  private countHit(beatGrade: Grade | null) {
    const stats = session.stats!;
    stats.hits++;
    if (beatGrade === "perfect") stats.perfects++;
  }

  /** What would have hit: the next howl if one is coming, else the nearest visible target's chords. */
  private neededNow(visibleTargets: SymbolTarget[]): string[] {
    const howl = this.upcomingSymbols()[0];
    if (howl) return [howl];
    const nearest = visibleTargets.reduce<SymbolTarget | null>((best, t) => (!best || t.x < best.x ? t : best), null);
    return nearest ? [...new Set(nearest.wants ?? [nearest.next!])] : [];
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

  /** A wrong chord: a few grey sparks from the lute (the bubble says what was needed). */
  private fizzle(ev: NoteEvent) {
    const h = this.hero;
    burst(this, h.x + 40, h.y - 90, { tint: [0xbfbfbf, 0xffffff], count: 5, speed: 90, gravityY: 0, scale: 0.5 });
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
    headline(this, "The fairy godmother!", { sub: `Play ${sym} to heal`, tone: "heal", hold: 2200 });
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
    popup(this, this.besideHero(), h.y - 118, `+${amount}`, "#8fe36a", 34);
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
    this.heardChip.hide();
    h.magic = 0;
    this.superHintShown = false;
    gameAudio.play("super");
    this.syncPhysicsPause();
    // Reduced motion: the letterbox is simply there, with no slide, zoom, pop or shake.
    const still = reducedMotion();
    const top = this.add.rectangle(0, still ? 0 : -90, 1280, 90, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
    const bot = this.add.rectangle(0, still ? 630 : 720, 1280, 90, 0x000000).setOrigin(0, 0).setScrollFactor(0).setDepth(200);
    if (!still) {
      this.tweens.add({ targets: top, y: 0, duration: 250 });
      this.tweens.add({ targets: bot, y: 630, duration: 250 });
    }
    zoomTo(this, 1.15, 400);
    const title = this.add
      .text(640, 300, "Happily Ever After", { fontFamily: FONT, fontSize: "72px", fontStyle: "italic 800", color: "#ffe066", stroke: "#2b1a12", strokeThickness: 10 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(210)
      .setAlpha(0)
      .setScale(still ? 1 : 0.6);
    const sub = text(this, 640, 380, "...and they all lived happily ever after.", 30, "#fff6dc").setScrollFactor(0).setDepth(210).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 500, ease: "Back.Out" });
    this.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 300 });
    const sparkle = this.time.addEvent({
      delay: 120,
      repeat: 12,
      callback: () => burst(this, h.x + Phaser.Math.Between(-300, 600), h.y - Phaser.Math.Between(40, 300), { tint: [0xffe066, 0xffffff, 0xff9ff3], count: 8, speed: 200, gravityY: 0 }),
    });
    this.time.delayedCall(1600, () => {
      flash(this, 350, 255, 240, 200);
      shake(this, 400, 0.02);
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
      if (reducedMotion()) {
        top.destroy();
        bot.destroy();
      } else {
        this.tweens.add({ targets: top, y: -90, duration: 300, onComplete: () => top.destroy() });
        this.tweens.add({ targets: bot, y: 720, duration: 300, onComplete: () => bot.destroy() });
      }
      zoomTo(this, 1, 400);
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
    let homing = false;
    if (!frozen && h.hp > 0 && now >= this.dashUntil) {
      const back = this.homeVelocity(now);
      homing = back !== 0;
      h.setVelocityX(homing ? back : blocked ? 0 : this.walkSpeed);
    }
    h.facing = 1;
    if (h.x < 40) h.x = 40;
    if (h.x > this.worldWidth - 40) h.x = this.worldWidth - 40;
    h.tick(now, dt, homing || (!blocked && !frozen && this.walkSpeed > 0));

    for (const e of this.enemies) {
      e.tick(now);
      e.animate(now);
    }
    this.stackBadges(this.focusEnemy());
    this.enemies = this.enemies.filter((e) => e.active);
    this.tickCandies(dt, frozen);
    this.tickFairy(now);
    this.tickScene(now, dt);

    // The bard's triangle: the plate to read (a size up, with the beat frame) and the bubble over the bard.
    const focusEnemy = this.focusEnemy();
    for (const e of this.enemies) e.setFocus(e === focusEnemy, !!focusEnemy);
    const focus = this.focusTarget(focusEnemy);
    this.drawBeatFrame(focus?.bounds ?? null, focusEnemy);
    this.heardChip.follow(h.x, h.y, focus?.bounds);

    if (now - this.lastHudAt > 100) {
      this.lastHudAt = now;
      this.emitHud();
    }
    if (now - this.lastFpsAt > 500) {
      this.lastFpsAt = now;
      EventBus.emit(EV.fps, this.game.loop.actualFps);
    }
  }

  /**
   * An arena's bard steps back to their post (heroHomeX) once a knockback has read: up to HOME_SPEED px/s,
   * easing in over the last few px. 0 = no home, not yet, or there.
   */
  private homeVelocity(now: number): number {
    const home = this.heroHomeX();
    if (home === null || now < this.dashUntil + HOME_BEAT_MS) return 0;
    const d = home - this.hero.x;
    if (Math.abs(d) < 1) {
      this.hero.x = home;
      return 0;
    }
    return Math.sign(d) * Phaser.Math.Clamp(HOME_EASE * Math.abs(d), HOME_MIN_SPEED, HOME_SPEED);
  }

  /**
   * Foes walking close together: stack their plates (by their real size, keycaps included) so each stays readable.
   * Next to the plate to read the gap is wider, so its beat frame closes on that plate alone.
   */
  private stackBadges(focus: Enemy | null) {
    const placed: { x: number; y: number; hw: number; h: number; focus: boolean }[] = [];
    const alive = this.enemies.filter((e) => e.alive).sort((a, b) => a.x - b.x);
    for (const e of alive) {
      const hw = e.badgeHalfWidth;
      const h = e.badgeHeight;
      const x = e.badgeX;
      const isFocus = e === focus;
      let lift = 0;
      for (let guard = 0; guard < 4; guard++) {
        const y = e.badgeY - lift;
        const hits = placed.filter((p) => Math.abs(p.x - x) < p.hw + hw + 6 && Math.abs(p.y - y) < (p.h + h) / 2 + 4);
        if (!hits.length) break;
        lift += h + (isFocus || hits.some((p) => p.focus) ? FOCUS_GAP : 8);
      }
      e.badgeLift = lift;
      placed.push({ x, y: e.badgeY - lift, hw, h, focus: isFocus });
    }
  }

  /** The foe to read now: the nearest one in view that still shows a chord. */
  protected focusEnemy(): Enemy | null {
    const view = this.cameras.main.worldView;
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (e.alive && e.next && e.x > view.x && e.x < view.right - 10 && (!best || e.x < best.x)) best = e;
    }
    return best;
  }

  /** The plate the player should be reading: the nearest foe's, or (boss) the wolf's chip. */
  focusTarget(e = this.focusEnemy()): FocusPlate | null {
    if (!e) return this.focusExtra();
    return {
      get bounds() {
        return e.badgeBounds;
      },
      nudge: () => e.nudge(),
    };
  }

  /**
   * A gold frame that closes on the focus plate and lands on every beat (a blink under reduced motion).
   * It stays 4 px short of any other foe's plate, so it never brackets two; while plates overlap for a
   * moment (a stack settling, two foes walking in at the edge) it waits.
   */
  private drawBeatFrame(b: Phaser.Geom.Rectangle | null, focusEnemy: Enemy | null) {
    const g = this.beatFrame.clear();
    const m = this.music;
    if (!b || !m?.playing || this.cinematic) return;
    const off = m.offsetToNearestBeat(performance.now());
    if (off === null) return;
    const beatMs = 60000 / m.bpm;
    const until = off < 0 ? -off : beatMs - off;
    const p = 1 - Math.min(1, until / beatMs);
    const room = this.plateClearance(b, focusEnemy) - 4;
    if (room < 0) return;
    const still = reducedMotion();
    const pad = Math.min(still ? 6 : 6 + 34 * (1 - p), room);
    const a = still ? (until < 90 || beatMs - until < 90 ? 1 : 0.3) : 0.3 + 0.65 * p;
    const [x, y, w, h, r] = [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad, 14 + pad * 0.3];
    g.lineStyle(7, C.ink, a * 0.5).strokeRoundedRect(x, y, w, h, r);
    g.lineStyle(4, C.gold, a).strokeRoundedRect(x, y, w, h, r);
  }

  /** How far `b` can grow on every side before it touches another foe's plate (Infinity: none near). */
  private plateClearance(b: Phaser.Geom.Rectangle, focusEnemy: Enemy | null): number {
    let room = Infinity;
    for (const e of this.enemies) {
      if (e === focusEnemy || !e.alive || !e.next) continue;
      const o = e.badgeBounds;
      // A frame grown by `pad` meets o once pad passes both the horizontal and the vertical gap.
      room = Math.min(room, Math.max(o.left - b.right, b.left - o.right, o.top - b.bottom, b.top - o.bottom));
    }
    return room;
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
      cinematic: this.cinematic,
      ...this.hudExtra(),
    };
    EventBus.emit(EV.hud, state);
  }

  /** What the chord helper shows, threats first: the next howl, foes nearest-first, then heal, then super. */
  private wantedSymbols(): NonNullable<HudState["wanted"]> {
    const view = this.cameras.main.worldView;
    const out: NonNullable<HudState["wanted"]> = [];
    const seen = new Set<string>();
    const add = (symbol: string, role: NonNullable<HudState["wanted"]>[number]["role"]) => {
      if (seen.has(symbol)) return;
      seen.add(symbol);
      out.push({ symbol, role });
    };
    const howl = this.upcomingSymbols()[0];
    if (howl) add(howl, "howl");
    const targets = this.allTargets()
      .filter((t) => t.alive && t.next && t.x < view.right + 40 && t.x > view.x - 40)
      .sort((a, b) => a.x - b.x);
    for (const t of targets) for (const symbol of t.wants ?? [t.next!]) add(symbol, "foe");
    if (this.fairy && !this.fairy.done) add(this.symbols.heal, "heal");
    if (this.hero.magic >= 100) add(this.symbols.super, "super");
    return out.slice(0, 4);
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
    this.unsubDiag?.();
    this.unsubDiag = null;
    this.music?.stop();
    this.music = null;
  }
}
