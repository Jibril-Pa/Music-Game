/**
 * Boss: the Big Bad Wolf (each world has its own form, arena, pack and song;
 * see BOSSES in levels.ts), driven by a processed song (chart.json +
 * backing.mp3) or the world's built-in demo.
 *
 * Howl phases: the easy-chart notes become howls. Each appears above the
 * wolf showing a chord (or note), then flies at the bard and arrives exactly
 * on its beat. Play it within the window to parry it back at him; miss it and
 * the bard takes a hit.
 * Pack phases: wolf pups charge in (each with a chord), the wolf shows his own
 * chord (play it to strike him), and once per phase he huffs and puffs: a gust
 * carrying a chord. Play it to blow it back, or get blown away.
 */

import Phaser from "phaser";
import { GRADE_DAMAGE, judge, type Grade } from "@/lib/combat/rhythm";
import { matches, randomSymbols } from "@/lib/combat/spells";
import { demoSong, loadJobSong, type Attack, type BossSong, type Phase } from "@/lib/boss/songs";
import { gameAudio } from "@/lib/game-audio/audio";
import type { NoteEvent } from "@/lib/input/types";
import { BigBadWolf } from "../entities/BigBadWolf";
import { EventBus, onBus } from "../EventBus";
import { EV, type BossSongChoice, type HudState } from "../events";
import { FONT, GROUND_Y, burst, damageNumber, flash, headline, light, popup, reducedMotion, shake } from "../fx";
import { BOSSES, LEVELS, isFinalLevel, levelAt, unlockLevel, type BossDef, type JourneyLevel, type WorldId } from "../levels";
import { session } from "../state";
import { FightScene, chipPlate, symbolChip, type FocusPlate, type Parry, type SymbolTarget } from "./FightScene";
import { actorTint, showWorld } from "../stage";
import { bossArena } from "./worlds";

const HOVER_FRACTION = 0.3; // first part of a howl's time it hovers above the wolf
const PARRY_DAMAGE = { chords: 30, notes: 22 };
const WOLF_STRIKE_DAMAGE = 40;
/** After each strike the wolf staggers this long before showing a new chord. */
const WOLF_STAGGER_MS = 700;
const GUST_BACK_DAMAGE = 45;
/** Parry window (ms) around a howl's beat. Chords get a little more slack. */
const PARRY_WINDOW = { chords: 200, notes: 150, practice: 320 };

interface Orb {
  key: string;
  attack: Attack;
  hitPerf: number;
  spawnPerf: number;
  img: Phaser.GameObjects.Image;
  chip: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  resolved: boolean;
}

interface Gust {
  img: Phaser.GameObjects.Image;
  chip: Phaser.GameObjects.Container;
  symbol: string;
  done: boolean;
}

export class Boss extends FightScene {
  private def: BossDef = BOSSES.forest;
  private world: WorldId = "forest";
  private wolf!: BigBadWolf;
  private song: BossSong | null = null;
  private started = false;
  private loading = false;
  /** From the title card and 3-2-1 until the song starts. */
  private countingDown = false;
  private orbs: Orb[] = [];
  private spawned = new Set<string>();
  private phaseKey = -1;
  private phaseKind: Phase["kind"] = "intro";
  private huffDone = new Set<number>();
  private gusts: Gust[] = [];
  private wolfSymbol: string | null = null;
  private wolfChip: Phaser.GameObjects.Container | null = null;
  private nextPupAt = 0;
  private abort: AbortController | null = null;

  constructor() {
    super("Boss");
  }

  protected heroStartX() {
    return 260;
  }

  /** The bard holds their post: knocked back, they step back to where they started (gusts are timed from there). */
  protected heroHomeX() {
    return this.heroStartX();
  }

  create() {
    const lv = levelAt(session.level);
    this.def = lv.kind === "boss" ? lv.boss : BOSSES.forest;
    this.world = lv.world;
    // His pack is as fast and tough as the world's last walk (later worlds: faster pups that need more chords).
    const d = LEVELS.filter((l): l is JourneyLevel => l.kind === "journey" && l.world === this.world).at(-1)?.difficulty;
    this.foeMods = { speed: d?.foeSpeed ?? 1, damage: d?.foeDamage ?? 1 };
    this.toughness = d?.toughness ?? 1;
    this.worldWidth = 1280;
    this.walkSpeed = 0;
    this.stage = 3;
    this.song = null;
    this.started = false;
    this.loading = false;
    this.countingDown = false;
    this.orbs = [];
    this.spawned = new Set();
    this.phaseKey = -1;
    this.phaseKind = "intro";
    this.huffDone = new Set();
    this.gusts = [];
    this.wolfSymbol = null;
    this.wolfChip = null;
    session.heroMaxHp = 100;
    super.create();
    this.wolf = new BigBadWolf(this, 1010, this.def.hp, this.def.texture);
    this.hero.hp = this.hero.maxHp; // a fresh start after the walk
    onBus(this, EV.bossSongChosen, this.onSongChosen as (...a: never[]) => void);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.abort?.abort());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.abort?.abort());
    EventBus.emit(EV.bossIntro, true);
  }

  protected buildWorld() {
    const world = levelAt(session.level).world;
    const in3d = showWorld(this, { world, night: world !== "forest", kind: "arena" });
    light.tint = in3d ? actorTint() : 0xffffff;
    if (!in3d) bossArena(this, world);
    this.cameras.main.stopFollow();
  }

  // ---------------------------------------------------------------- song
  private onSongChosen(choice: BossSongChoice) {
    if (this.loading || this.started) return;
    this.loading = true;
    EventBus.emit(EV.bossLoading, true);
    this.abort = new AbortController();
    const mode = session.playMode;
    const demo = () => demoSong(mode, { bpm: this.def.demo.bpm, world: this.world, title: this.def.demo.title });
    const load = choice.kind === "job" && choice.jobId ? loadJobSong(choice.jobId, mode, this.abort.signal) : Promise.resolve(demo());
    load
      .catch((err) => {
        console.warn("[boss] couldn't load that song, using the demo", err);
        EventBus.emit(EV.toast, "Couldn't load that song, playing the built-in demo instead.");
        return demo();
      })
      .then((song) => {
        if (!this.scene.isActive() && !this.scene.isPaused()) return;
        this.song = song;
        this.loading = false;
        EventBus.emit(EV.bossLoading, false);
        EventBus.emit(EV.bossIntro, false);
        this.countdown();
      });
  }

  /** The title card, then 3, 2, 1, Play! (the React HUD steps aside meanwhile). */
  private countdown() {
    const lv = levelAt(session.level);
    this.countingDown = true;
    popup(this, 640, 150, `${lv.id} · ${lv.name}`, "#ffe9a8", 34, 2000);
    popup(this, 640, 210, this.def.name, "#ffd6a0", 60, 1800);
    const steps = ["3", "2", "1", "Play!"];
    steps.forEach((s, i) =>
      this.time.delayedCall(i * 600, () => {
        gameAudio.play(i < 3 ? "tick" : "perfect");
        popup(this, 640, 300, s, i < 3 ? "#ffffff" : "#ffe066", i < 3 ? 80 : 64, 400);
        if (i === steps.length - 1) this.startSong();
      }),
    );
  }

  private startSong() {
    this.countingDown = false;
    if (!this.song) return;
    this.music = this.song.clock;
    this.music.onBeat = (b) => {
      EventBus.emit(EV.beat, b);
      if (this.wolf.alive && this.wolf.state === "idle") this.tweens.add({ targets: this.wolf, scaleY: 1.05, duration: 80, yoyo: true });
    };
    this.music.start();
    this.started = true;
  }

  private songNow(): { t: number; loop: number; local: number } {
    const t = this.music!.songTimeAt(performance.now());
    const loop = Math.max(0, Math.floor(t / this.song!.duration));
    return { t, loop, local: t - loop * this.song!.duration };
  }

  private currentPhase(local: number): { phase: Phase; index: number } {
    const phases = this.song!.phases;
    // The song is still starting (its first beat isn't heard yet): that's the intro.
    if (local < 0) return { phase: phases[0], index: 0 };
    let i = phases.findIndex((p) => local >= p.start && local < p.end);
    // A loop's last moments, after its last phase: that phase goes on.
    if (i < 0) i = phases.length - 1;
    return { phase: phases[i], index: i };
  }

  // ---------------------------------------------------------------- frame
  protected tickScene(now: number, dt: number) {
    this.wolf.tickVisual(now);
    this.wolfChip?.setPosition(this.wolf.x - 30, this.wolf.y - 350);
    this.tickGusts(dt);
    if (!this.started || !this.song || this.ended) return;

    const perf = performance.now();
    const { loop, local } = this.songNow();
    const { phase, index } = this.currentPhase(local);
    const key = loop * 1000 + index;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.enterPhase(phase);
    }

    // Spawn howls for upcoming attacks (this loop and the start of the next).
    for (const l of [loop, loop + 1]) {
      this.song.attacks.forEach((a, i) => {
        const k = `${l}:${i}`;
        if (this.spawned.has(k)) return;
        const hitPerf = this.music!.perfAt(l * this.song!.duration + a.t);
        if (hitPerf - this.def.leadMs <= perf && hitPerf > perf - 200) {
          this.spawned.add(k);
          this.spawnOrb(k, a, hitPerf);
        }
      });
    }
    this.tickOrbs(perf);

    if (phase.kind === "free" && this.wolf.alive) {
      // His pack charges in every few seconds.
      if (now >= this.nextPupAt && this.enemies.filter((e) => e.alive).length < 2) {
        const [lo, hi] = this.def.pupEveryMs;
        this.nextPupAt = now + lo + Math.random() * (hi - lo);
        this.addEnemy(this.def.pup, 1360); // may need 1-3 chords
      }
      // Huff and puff once (or twice) per pack phase.
      for (let k = 0; k < this.def.huffs; k++) {
        const at = phase.start + (phase.end - phase.start) * ((k + 1) / (this.def.huffs + 1));
        const key = this.phaseKey * 10 + k;
        if (!this.huffDone.has(key) && local >= at) {
          this.huffDone.add(key);
          this.huffAndPuff();
        }
      }
    }
  }

  private enterPhase(phase: Phase) {
    this.phaseKind = phase.kind;
    const what = session.playMode === "chords" ? "chord" : "note";
    // The wolf only takes a chord between verses: anywhere else his chip would do nothing.
    if (phase.kind !== "free") this.setWolfSymbol(null);
    if (phase.kind === "parry") {
      headline(this, "Howls incoming!", { sub: `Play each howl's ${what} as it reaches you`, y: 176 });
    } else if (phase.kind === "free") {
      headline(this, "Strike back!", { sub: `Play the ${what} over the wolf`, y: 176 });
      this.nextPupAt = this.time.now + 1500;
      this.setWolfSymbol(this.pickWolfSymbol());
    }
  }

  private pickWolfSymbol(): string {
    const [s] = randomSymbols(session.playMode, 3, 1);
    return s === this.wolfSymbol ? randomSymbols(session.playMode, 3, 1)[0] : s;
  }

  private setWolfSymbol(sym: string | null) {
    this.wolfChip?.destroy();
    this.wolfChip = null;
    this.wolfSymbol = sym;
    if (sym) {
      this.wolfChip = symbolChip(this, sym, this.keyHint(sym));
      this.wolfChip.setPosition(this.wolf.x - 30, this.wolf.y - 350);
      if (reducedMotion()) this.wolfChip.setScale(1.2);
      else {
        this.wolfChip.setScale(0.5);
        this.tweens.add({ targets: this.wolfChip, scale: 1.2, duration: 200, ease: "Back.Out" });
      }
    }
  }

  /** Between verses with no pup in view, the plate to read is the wolf's own chord. */
  protected focusExtra(): FocusPlate | null {
    return this.phaseKind === "free" && this.wolfChip?.active ? chipPlate(this, this.wolfChip) : null;
  }

  /** The next howl's chip: it shakes its head after a wrong chord. */
  protected howlPlate(): FocusPlate | null {
    const next = this.orbs.filter((o) => !o.resolved).sort((a, b) => a.hitPerf - b.hitPerf)[0];
    return next ? chipPlate(this, next.chip) : null;
  }

  // ---------------------------------------------------------------- huff and puff
  private huffAndPuff() {
    const wolf = this.wolf;
    if (!wolf.alive || wolf.state === "huff") return;
    wolf.state = "huff";
    wolf.pose("huff");
    this.setWolfSymbol(null);
    popup(this, wolf.x, wolf.y - 360, this.def.gustLines[0], "#ffffff", 28, 1300);
    this.tweens.add({ targets: wolf, scaleX: 1.08, scaleY: 1.08, duration: 1000, ease: "Sine.In" });
    gameAudio.play("wind");
    this.time.delayedCall(1100, () => {
      if (!wolf.alive) return;
      wolf.setScale(1);
      popup(this, wolf.x - 100, wolf.y - 320, this.def.gustLines[1], "#ffffff", 30, 900);
      shake(this, 400, 0.005);
      const [symbol] = randomSymbols(session.playMode, 3, 1);
      const img = this.add.image(wolf.mouth.x, GROUND_Y - 130, "wind").setDepth(32).setScale(2).setFlipX(true).setTint(this.def.gustTint);
      const chip = symbolChip(this, symbol, this.keyHint(symbol));
      this.gusts.push({ img, chip, symbol, done: false });
      this.time.delayedCall(800, () => {
        if (!wolf.alive) return;
        wolf.state = "idle";
        wolf.pose("");
        if (this.phaseKind === "free") this.setWolfSymbol(this.pickWolfSymbol());
      });
    });
  }

  private tickGusts(dt: number) {
    const s = dt / 1000;
    const hero = this.hero;
    for (const g of this.gusts) {
      if (g.done) continue;
      if (!this.isFrozen()) g.img.x -= 330 * s; // slow: about 2 s to arrive
      g.img.rotation = Math.sin(this.time.now / 90) * 0.1;
      g.chip.setPosition(g.img.x, g.img.y - 110);
      if (g.img.x - hero.x < 70) {
        this.endGust(g);
        this.heroHurt(10, g.img.x, "Huff and puff");
        hero.setVelocityX(-500);
      }
    }
    this.gusts = this.gusts.filter((g) => !g.done);
  }

  private endGust(g: Gust) {
    g.done = true;
    g.chip.destroy();
    this.tweens.add({ targets: g.img, alpha: 0, duration: 250, onComplete: () => g.img.destroy() });
  }

  // ---------------------------------------------------------------- howls
  private spawnOrb(key: string, attack: Attack, hitPerf: number) {
    const m = this.wolf.mouth;
    const img = this.add.image(m.x, m.y - 60, "orb").setDepth(35).setScale(0.3);
    const chip = symbolChip(this, attack.symbol, this.keyHint(attack.symbol), "small");
    const ring = this.add.graphics().setDepth(34);
    this.tweens.add({ targets: img, scale: 1.1, duration: 200, ease: "Back.Out" });
    this.orbs.push({ key, attack, hitPerf, spawnPerf: hitPerf - this.def.leadMs, img, chip, ring, resolved: false });
  }

  private orbPos(o: Orb, perf: number): { x: number; y: number; p: number } {
    const m = this.wolf.mouth;
    const start = { x: m.x - 20, y: m.y - 70 };
    const end = { x: this.hero.x, y: this.hero.y - 120 };
    const p = Phaser.Math.Clamp((perf - o.spawnPerf) / (o.hitPerf - o.spawnPerf), 0, 1.2);
    if (p < HOVER_FRACTION) return { x: start.x, y: start.y + Math.sin(perf / 120) * 6, p };
    const q = Math.min(1, (p - HOVER_FRACTION) / (1 - HOVER_FRACTION));
    return { x: Phaser.Math.Linear(start.x, end.x, q), y: Phaser.Math.Linear(start.y, end.y, q) - Math.sin(q * Math.PI) * 140, p };
  }

  private window(): number {
    return session.practice ? PARRY_WINDOW.practice : PARRY_WINDOW[session.playMode];
  }

  private tickOrbs(perf: number) {
    const win = this.window();
    for (const o of this.orbs) {
      if (o.resolved) continue;
      const { x, y, p } = this.orbPos(o, perf);
      o.img.setPosition(x, y).setRotation(perf / 400);
      o.chip.setPosition(x, y);
      // Shrinking timing ring: touches the orb exactly on the beat.
      o.ring.clear();
      if (p < 1) o.ring.lineStyle(5, 0xffe066, 0.35 + 0.6 * p).strokeCircle(x, y, 38 + 70 * (1 - p));
      if (perf > o.hitPerf + win) this.missOrb(o);
    }
    this.orbs = this.orbs.filter((o) => !o.resolved);
  }

  private destroyOrb(o: Orb) {
    o.resolved = true;
    o.ring.destroy();
    o.chip.destroy();
  }

  private missOrb(o: Orb) {
    this.destroyOrb(o);
    session.stats!.parryAttempts++;
    burst(this, o.img.x, o.img.y, { tint: [0xff7a7a, 0xffe066], count: 10, speed: 220 });
    o.img.destroy();
    gameAudio.play("miss");
    this.heroHurt(this.def.missDamage, this.wolf.x, "Howl");
  }

  protected interceptNote(ev: NoteEvent): Parry | null {
    if (!this.started) return null;
    const win = this.window();
    let best: Orb | null = null;
    for (const o of this.orbs) {
      if (o.resolved || !matches(ev, o.attack.symbol, session.playMode, session.practice)) continue;
      const d = Math.abs(ev.time - o.hitPerf);
      if (d <= win && (!best || d < Math.abs(ev.time - best.hitPerf))) best = o;
    }
    if (!best) return null;
    const offsetMs = ev.time - best.hitPerf;
    const grade = judge(offsetMs, session.practice);
    this.parry(best, grade);
    return { label: grade === "perfect" ? "Perfect! Sent back" : "Sent back!", grade, offsetMs, symbol: best.attack.symbol };
  }

  private parry(o: Orb, grade: Grade) {
    const stats = session.stats!;
    stats.parries++;
    stats.parryAttempts++;
    this.destroyOrb(o);
    gameAudio.play("parry");
    burst(this, o.img.x, o.img.y, { tint: [0xffe066, 0xffffff, 0xc6f3ff], count: 18, speed: 300 });
    this.hero.addMagic(grade === "perfect" ? 8 : 5);
    const target = { x: this.wolf.x, y: this.wolf.y - 180 };
    this.tweens.add({
      targets: o.img,
      x: target.x,
      y: target.y,
      scale: 0.6,
      duration: 220,
      ease: "Quad.In",
      onComplete: () => {
        o.img.destroy();
        this.damageWolf(Math.round(PARRY_DAMAGE[session.playMode] * GRADE_DAMAGE[grade]), grade);
      },
    });
  }

  protected upcomingSymbols(): string[] {
    return this.orbs.filter((o) => !o.resolved).sort((a, b) => a.hitPerf - b.hitPerf).map((o) => o.attack.symbol);
  }

  // ---------------------------------------------------------------- targets
  protected extraTargets(): SymbolTarget[] {
    const list: SymbolTarget[] = [];
    const wolf = this.wolf;
    if (wolf?.alive && this.wolfSymbol && this.phaseKind === "free") {
      list.push({
        x: wolf.x,
        y: wolf.y,
        alive: true,
        next: this.wolfSymbol,
        hitHeight: 260,
        strike: (_now, grade) => {
          this.damageWolf(Math.round(WOLF_STRIKE_DAMAGE * (grade ? GRADE_DAMAGE[grade] : 1)), grade);
          if (wolf.alive) {
            wolf.state = "stagger";
            wolf.pose("hurt");
            this.setWolfSymbol(null);
            this.time.delayedCall(WOLF_STAGGER_MS, () => {
              if (!wolf.alive) return;
              wolf.state = "idle";
              wolf.pose("");
              if (this.phaseKind === "free") this.setWolfSymbol(this.pickWolfSymbol());
            });
          }
          return { slain: !wolf.alive, label: "struck the wolf" };
        },
      });
    }
    for (const g of this.gusts) {
      if (g.done) continue;
      list.push({
        get x() {
          return g.img.x;
        },
        y: g.img.y + 60,
        get alive() {
          return !g.done;
        },
        next: g.symbol,
        hitHeight: 120,
        strike: () => {
          g.chip.destroy();
          g.done = true;
          this.tweens.add({ targets: g.img, x: wolf.x, scale: 1, duration: 300, onComplete: () => g.img.destroy() });
          this.time.delayedCall(300, () => this.damageWolf(GUST_BACK_DAMAGE, null));
          return { slain: false, label: "blew the gust back" };
        },
      });
    }
    return list;
  }

  private damageWolf(amount: number, grade: Grade | null) {
    const wolf = this.wolf;
    if (!wolf.alive) return;
    wolf.takeHit(amount, 1, 120, 0, this.time.now);
    damageNumber(this, wolf.x, wolf.y - 300, amount, grade);
    burst(this, wolf.x, wolf.y - 180, { tint: [0xffe066, 0xffffff], count: 12, speed: 260 });
    gameAudio.play("hit");
    this.checkWolfDown();
  }

  protected onSuperImpact() {
    this.damageWolf(Math.round(this.wolf.maxHp * 0.15), "perfect");
    for (const g of this.gusts) if (!g.done) this.endGust(g);
  }

  private checkWolfDown() {
    if (this.wolf.alive || this.ended) return;
    this.ended = true;
    const wolf = this.wolf;
    wolf.state = "defeated";
    this.setWolfSymbol(null);
    for (const o of this.orbs) {
      this.destroyOrb(o);
      o.img.destroy();
    }
    this.orbs = [];
    for (const e of this.enemies) e.vanish();
    for (const g of this.gusts) if (!g.done) this.endGust(g);
    this.music?.stop();
    gameAudio.play("victory");
    wolf.pose("hurt");
    flash(this, 400, 255, 240, 200);
    unlockLevel(session.level + 1);
    headline(this, this.def.defeat, { hold: 2600 });
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 250, () =>
        burst(this, Phaser.Math.Between(200, 1080), Phaser.Math.Between(150, 400), { tint: [0xffe066, 0xff9ff3, 0x8fe36a, 0x58c7ff], count: 20, speed: 320 }),
      );
    }
    if (isFinalLevel(session.level)) this.hourglassReturns();
    else this.escapeThroughTime();
  }

  /** He dives into a time portal with the Hourglass: the chase goes on. */
  private escapeThroughTime() {
    const wolf = this.wolf;
    const portal = this.add.image(1190, GROUND_Y - 170, "portal").setDepth(15).setScale(0).setAlpha(0.95);
    this.tweens.add({ targets: portal, scale: 1, duration: 600, ease: "Back.Out", delay: 400 });
    this.tweens.add({ targets: portal, angle: 360, duration: 3000, repeat: -1 });
    gameAudio.play("wind");
    this.tweens.add({ targets: wolf, x: 1190, scale: 0.2, alpha: 0, angle: 180, duration: 1300, ease: "Cubic.In", delay: 1000 });
    this.tweens.add({ targets: wolf.shadow, alpha: 0, duration: 800, delay: 1000 });
    this.time.delayedCall(2400, () => headline(this, "After him, through time!", { hold: 1600 }));
    this.time.delayedCall(3600, () => this.finish(true));
  }

  /** The last fight: the Hourglass of Ages comes home. */
  private hourglassReturns() {
    const wolf = this.wolf;
    this.tweens.add({ targets: wolf, x: 1500, angle: 10, duration: 1600, ease: "Cubic.In", delay: 500 });
    const glass = this.add.image(wolf.x - 80, GROUND_Y - 200, "hourglass").setDepth(40).setScale(0.6);
    this.tweens.add({ targets: glass, x: this.hero.x + 40, y: this.hero.y - 220, scale: 1.4, angle: 360, duration: 1500, ease: "Sine.InOut", delay: 700 });
    this.time.delayedCall(2300, () => {
      burst(this, this.hero.x + 40, this.hero.y - 220, { tint: [0xffe066, 0xffffff, 0xb8f5ff], count: 30, speed: 300 });
      this.add
        .text(640, 320, "...and they all lived happily ever after,\nin every age.", { fontFamily: FONT, fontSize: "34px", fontStyle: "bold italic", color: "#fff6dc", stroke: "#2b1a12", strokeThickness: 8, align: "center" })
        .setOrigin(0.5)
        .setDepth(60);
    });
    this.time.delayedCall(4600, () => this.finish(true));
  }

  /**
   * The phase instruction: one line per phase, so the banner can settle (only a live gust interrupts the
   * free phase). It never names a chord: the wolf's comes and goes as he staggers and huffs.
   */
  private objective(): string {
    const what = session.playMode === "chords" ? "chord" : "note";
    if (this.loading) return "Loading the song…";
    if (!this.started) return this.song || this.countingDown ? "Get ready…" : "Choose the wolf's song";
    if (this.phaseKind === "parry") return `Howls: play each ${what} as it reaches you`;
    if (this.phaseKind !== "free") return "Get ready…";
    if (this.gusts.some((g) => !g.done)) return `A gust! Play its ${what} to blow it back`;
    return `Strike back: play each ${what} the wolf shows`;
  }

  protected hudExtra(): Partial<HudState> {
    const label = this.objective();
    return {
      boss: this.wolf ? { name: this.def.name, hp: this.wolf.hp, maxHp: this.wolf.maxHp, phase: label } : null,
      objective: label,
      cinematic: this.countingDown || this.cinematic,
    };
  }
}
