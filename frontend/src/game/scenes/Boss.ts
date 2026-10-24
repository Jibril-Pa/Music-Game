/**
 * Boss: the Big Bad Wolf, driven by a processed song (chart.json + backing.mp3)
 * or the built-in demo.
 *
 * Parry phases: each easy-chart note becomes a glowing note orb. It appears
 * above the wolf, then flies at the hero and arrives exactly on the note's
 * time. Play that note within the window to parry (counter-damage); miss it
 * and the hero takes a hit.
 * Free phases: the wolf stalks and swipes, and once per phase he huffs and
 * puffs (a wind gust the Em shield blocks). Attack freely with combos.
 */

import Phaser from "phaser";
import { GRADE_DAMAGE, judge, parryWindow, type Grade } from "@/lib/combat/rhythm";
import { demoSong, loadJobSong, type Attack, type BossSong, type Phase } from "@/lib/boss/songs";
import { gameAudio } from "@/lib/game-audio/audio";
import { keyFor } from "@/lib/input/noteInput";
import type { NoteEvent } from "@/lib/input/types";
import { BigBadWolf } from "../entities/BigBadWolf";
import { EventBus, onBus } from "../EventBus";
import { EV, type BossSongChoice, type HudState } from "../events";
import { GROUND_Y, burst, damageNumber, popup, text } from "../fx";
import { session } from "../state";
import { FightScene, type Hittable } from "./FightScene";

const LEAD_MS = 1700; // orb visible this long before its note
const HOVER_FRACTION = 0.3; // first part of that time it hovers above the wolf
const MISS_DAMAGE = 4;
const PARRY_DAMAGE = 22;
const WOLF_HP = 1400;

interface Orb {
  key: string;
  attack: Attack;
  hitPerf: number;
  spawnPerf: number;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Graphics;
  resolved: boolean;
}

export class Boss extends FightScene {
  private wolf!: BigBadWolf;
  private song: BossSong | null = null;
  private started = false;
  private loading = false;
  private orbs: Orb[] = [];
  private spawned = new Set<string>();
  private phaseIdx = -1;
  private huffDone = new Set<number>();
  private winds: { img: Phaser.GameObjects.Image; hit: boolean }[] = [];
  private abort: AbortController | null = null;

  constructor() {
    super("Boss");
  }

  protected heroStartX() {
    return 260;
  }

  create() {
    this.worldWidth = 1280;
    this.song = null;
    this.started = false;
    this.loading = false;
    this.orbs = [];
    this.spawned = new Set();
    this.phaseIdx = -1;
    this.huffDone = new Set();
    this.winds = [];
    session.heroMaxHp = 100;
    super.create();
    this.bounds = { left: 60, right: 1220 };
    this.wolf = new BigBadWolf(this, 1010, WOLF_HP);
    this.hero.hp = this.hero.maxHp; // a fresh start after the forest
    onBus(this, EV.bossSongChosen, this.onSongChosen as (...a: never[]) => void);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.abort?.abort());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.abort?.abort());
    popup(this, 640, 200, "The Big Bad Wolf", "#ffd6a0", 60, 1800);
    EventBus.emit(EV.bossIntro, true);
  }

  protected buildWorld() {
    const sky = this.add.graphics().setDepth(-100);
    sky.fillGradientStyle(0xf6b98a, 0xf6b98a, 0xb9d6e0, 0xb9d6e0, 1).fillRect(0, 0, 1280, 720);
    this.add.circle(1050, 140, 80, 0xffe9b0).setDepth(-99);
    this.add.image(640, 160, "hills_far").setOrigin(0.5, 0).setDepth(-90);
    this.add.image(640, 230, "hills_mid").setOrigin(0.5, 0).setDepth(-85);
    this.add.image(640, 230, "forest_far").setOrigin(0.5, 0).setDepth(-80).setAlpha(0.8);
    this.add.image(170, GROUND_Y + 6, "house_straw").setOrigin(0.5, 1).setDepth(1).setScale(0.85);
    this.add.image(560, GROUND_Y + 6, "house_sticks").setOrigin(0.5, 1).setDepth(1).setScale(0.8);
    this.add.image(1130, GROUND_Y + 6, "house_bricks").setOrigin(0.5, 1).setDepth(1).setScale(0.9);
    this.add.image(380, GROUND_Y + 8, "tree").setOrigin(0.5, 1).setDepth(0).setScale(0.8);
    this.add.image(860, GROUND_Y + 8, "pine").setOrigin(0.5, 1).setDepth(0).setScale(0.9);
    this.add.tileSprite(0, GROUND_Y - 8, 1280, 150, "ground").setOrigin(0, 0).setDepth(1);
    for (const x of [90, 470, 760, 1220]) this.add.image(x, GROUND_Y + 12, "bush").setOrigin(0.5, 1).setScale(0.6).setDepth(3);
    this.cameras.main.stopFollow();
  }

  // ---------------------------------------------------------------- song
  private onSongChosen(choice: BossSongChoice) {
    if (this.loading || this.started) return;
    this.loading = true;
    EventBus.emit(EV.bossLoading, true);
    this.abort = new AbortController();
    const load = choice.kind === "job" && choice.jobId ? loadJobSong(choice.jobId, this.abort.signal) : Promise.resolve(demoSong());
    load
      .catch((err) => {
        console.warn("[boss] couldn't load that song, using the demo", err);
        EventBus.emit(EV.toast, "Couldn't load that song, playing the built-in demo instead.");
        return demoSong();
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

  private countdown() {
    const steps = ["3", "2", "1", "Play!"];
    steps.forEach((s, i) =>
      this.time.delayedCall(i * 600, () => {
        gameAudio.play(i < 3 ? "tick" : "perfect");
        popup(this, 640, 300, s, i < 3 ? "#ffffff" : "#ffe066", i < 3 ? 80 : 64, 500);
        if (i === steps.length - 1) this.startSong();
      }),
    );
  }

  private startSong() {
    if (!this.song) return;
    this.music = this.song.clock;
    this.music.onBeat = (b) => {
      EventBus.emit(EV.beat, b);
      // The wolf bobs to the music.
      if (this.wolf.alive && this.wolf.state === "idle") {
        this.tweens.add({ targets: this.wolf, scaleY: 1.05, duration: 80, yoyo: true });
      }
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
    let i = phases.findIndex((p) => local >= p.start && local < p.end);
    if (i < 0) i = phases.length - 1;
    return { phase: phases[i], index: i };
  }

  // ---------------------------------------------------------------- frame
  protected tickScene(now: number, dt: number) {
    const wolf = this.wolf;
    wolf.tickVisual(now);
    this.tickWinds(dt);
    if (!this.started || !this.song || this.ended) return;

    const perf = performance.now();
    const { loop, local } = this.songNow();
    const { phase, index } = this.currentPhase(local);
    const phaseKey = loop * 1000 + index;
    if (phaseKey !== this.phaseIdx) {
      this.phaseIdx = phaseKey;
      this.enterPhase(phase);
    }

    // Spawn orbs for upcoming attacks (this loop and the start of the next).
    for (const l of [loop, loop + 1]) {
      this.song.attacks.forEach((a, i) => {
        const key = `${l}:${i}`;
        if (this.spawned.has(key)) return;
        const hitPerf = this.music!.perfAt(l * this.song!.duration + a.t);
        if (hitPerf - LEAD_MS <= perf && hitPerf > perf - 200) {
          this.spawned.add(key);
          this.spawnOrb(key, a, hitPerf);
        }
      });
    }
    this.tickOrbs(perf);
    this.tickWolfAI(now, phase, index);
  }

  private enterPhase(phase: Phase) {
    const wolf = this.wolf;
    if (phase.kind === "parry") {
      popup(this, 640, 170, "Parry the howls!", "#ffe066", 40, 1200);
      popup(this, 640, 215, "play each note as it reaches you", "#fff6dc", 22, 1400);
      wolf.state = "retreat";
      this.tweens.add({ targets: wolf, x: 1010, duration: 500, ease: "Sine.Out", onComplete: () => wolf.alive && (wolf.state = "idle") });
      wolf.setTexture("bigwolf").clearTint();
    } else if (phase.kind === "free") {
      popup(this, 640, 170, "Strike back!", "#b8f5a0", 44, 1200);
      wolf.state = "stalk";
      wolf.nextSwipeAt = this.time.now + 1200;
    }
  }

  private tickWolfAI(now: number, phase: Phase, index: number) {
    const wolf = this.wolf;
    if (!wolf.alive) return;
    const hero = this.hero;
    const dx = hero.x - wolf.x;
    wolf.setFlipX(dx < 0);
    if (this.isFrozen()) return;

    if (wolf.state === "stagger") {
      if (now >= wolf.stateUntil) {
        wolf.state = phase.kind === "free" ? "stalk" : "idle";
        wolf.setTexture("bigwolf");
      }
      return;
    }
    if (phase.kind !== "free") return;

    const { local } = this.songNow();
    const mid = phase.start + (phase.end - phase.start) * 0.45;
    if (!this.huffDone.has(this.phaseIdx) && local >= mid && (wolf.state === "stalk" || wolf.state === "recover")) {
      this.huffDone.add(this.phaseIdx);
      this.huffAndPuff();
      return;
    }

    if (wolf.state === "stalk") {
      const dist = Math.abs(dx);
      if (dist > 200) wolf.x += Math.sign(dx) * 150 * (this.game.loop.delta / 1000);
      wolf.x = Phaser.Math.Clamp(wolf.x, 300, 1180);
      if (dist < 260 && now >= wolf.nextSwipeAt) {
        wolf.state = "windup";
        wolf.stateUntil = now + 650;
      }
    } else if (wolf.state === "windup") {
      wolf.setTint(Math.floor(now / 80) % 2 ? 0xffb066 : 0xffffff);
      if (now >= wolf.stateUntil) {
        wolf.clearTint();
        gameAudio.play("bite");
        this.tweens.add({ targets: wolf, x: wolf.x + Math.sign(dx) * 60, duration: 120, yoyo: true });
        if (Math.abs(dx) < 250) this.heroHurt(8, wolf.x, "Claw swipe");
        wolf.state = "recover";
        wolf.stateUntil = now + 600;
        wolf.nextSwipeAt = now + 2200 + Math.random() * 800;
      }
    } else if (wolf.state === "recover" && now >= wolf.stateUntil) {
      wolf.state = "stalk";
    }
    void index;
  }

  private huffAndPuff() {
    const wolf = this.wolf;
    wolf.state = "huff";
    wolf.setTexture("bigwolf_huff");
    popup(this, wolf.x, wolf.y - 340, "I'll huff... and I'll puff...", "#ffffff", 28, 1300);
    const hint = popup(this, this.hero.x, this.hero.y - 200, "Strum Em to shield!", "#c6f3ff", 26, 1500);
    hint.setDepth(70);
    this.tweens.add({ targets: wolf, scaleX: 1.08, scaleY: 1.08, duration: 1100, ease: "Sine.In" });
    gameAudio.play("wind");
    this.time.delayedCall(1300, () => {
      if (!wolf.alive) return;
      wolf.state = "blow";
      wolf.setScale(1);
      popup(this, wolf.x - 100, wolf.y - 300, "...and blow you away!", "#ffffff", 30, 900);
      this.cameras.main.shake(500, 0.006);
      for (let i = 0; i < 5; i++) {
        const img = this.add.image(wolf.mouth.x, GROUND_Y - 40 - i * 40, "wind").setDepth(32).setAlpha(0.9).setFlipX(true);
        this.winds.push({ img, hit: false });
      }
      this.time.delayedCall(900, () => {
        if (!wolf.alive) return;
        wolf.state = "stalk";
        wolf.setTexture("bigwolf");
        wolf.nextSwipeAt = this.time.now + 1500;
      });
    });
  }

  private tickWinds(dt: number) {
    const s = dt / 1000;
    const hero = this.hero;
    for (const w of this.winds) {
      if (!this.isFrozen()) w.img.x -= 760 * s;
      w.img.rotation = Math.sin(this.time.now / 90) * 0.1;
      if (!w.hit && Math.abs(w.img.x - hero.x) < 60 && Math.abs(w.img.y - (hero.y - 70)) < 120) {
        w.hit = true;
        if (hero.isShielded(this.time.now)) {
          this.heroHurt(0, w.img.x + 50, "Wind"); // shows "Blocked!"
        } else {
          this.heroHurt(10, w.img.x + 50, "Huff and puff");
          hero.setVelocityX(-700);
        }
      }
      if (w.img.x < -120) w.img.destroy();
    }
    this.winds = this.winds.filter((w) => w.img.active);
  }

  // ---------------------------------------------------------------- orbs
  private spawnOrb(key: string, attack: Attack, hitPerf: number) {
    const m = this.wolf.mouth;
    const img = this.add.image(m.x, m.y - 60, "orb").setDepth(35).setScale(0.3);
    const label = text(this, m.x, m.y - 60, attack.pc, 34, "#2b1a12", "#fff3c4").setDepth(36);
    const kb = keyFor(attack.pc);
    const hint = text(this, m.x, m.y - 20, kb ? `key ${kb}` : "", 15, "#fff3c4").setDepth(36);
    const ring = this.add.graphics().setDepth(34);
    this.tweens.add({ targets: img, scale: 1, duration: 200, ease: "Back.Out" });
    this.orbs.push({ key, attack, hitPerf, spawnPerf: hitPerf - LEAD_MS, img, label, hint, ring, resolved: false });
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

  private tickOrbs(perf: number) {
    const win = parryWindow(session.practice);
    for (const o of this.orbs) {
      if (o.resolved) continue;
      const { x, y, p } = this.orbPos(o, perf);
      o.img.setPosition(x, y).setRotation(perf / 400);
      o.label.setPosition(x, y);
      o.hint.setPosition(x, y + 38);
      // Shrinking timing ring: touches the orb exactly on the note.
      o.ring.clear();
      if (p < 1) {
        const r = 34 + 70 * (1 - p);
        o.ring.lineStyle(5, 0xffe066, 0.35 + 0.6 * p).strokeCircle(x, y, r);
      }
      if (perf > o.hitPerf + win) this.missOrb(o);
    }
    this.orbs = this.orbs.filter((o) => !o.resolved);
  }

  private destroyOrb(o: Orb) {
    o.resolved = true;
    o.ring.destroy();
    o.label.destroy();
    o.hint.destroy();
  }

  private missOrb(o: Orb) {
    this.destroyOrb(o);
    session.stats!.parryAttempts++;
    burst(this, o.img.x, o.img.y, { tint: [0xff7a7a, 0xffe066], count: 10, speed: 220 });
    o.img.destroy();
    gameAudio.play("miss");
    this.heroHurt(MISS_DAMAGE, this.wolf.x, "Howl");
  }

  protected interceptNote(ev: NoteEvent, _grade: Grade | null): string | null {
    if (!this.started || ev.type !== "note") return null;
    const win = parryWindow(session.practice);
    let best: Orb | null = null;
    for (const o of this.orbs) {
      if (o.resolved || o.attack.pc !== ev.pitchClass) continue;
      if (Math.abs(ev.time - o.hitPerf) <= win && (!best || Math.abs(ev.time - o.hitPerf) < Math.abs(ev.time - best.hitPerf))) best = o;
    }
    if (!best) return null;
    const offset = ev.time - best.hitPerf;
    const grade = judge(offset, session.practice);
    this.parry(best, grade);
    return grade === "perfect" ? "Perfect parry!" : "Parry!";
  }

  private parry(o: Orb, grade: Grade) {
    const stats = session.stats!;
    stats.parries++;
    stats.parryAttempts++;
    this.destroyOrb(o);
    gameAudio.play("parry");
    if (grade === "perfect") gameAudio.play("perfect");
    burst(this, o.img.x, o.img.y, { tint: [0xffe066, 0xffffff, 0xc6f3ff], count: 18, speed: 300 });
    popup(this, this.hero.x, this.hero.y - 200, grade === "perfect" ? "Perfect parry!" : "Parry!", grade === "perfect" ? "#ffd23f" : "#ffffff", 32, 600);
    this.hero.addMagic(grade === "perfect" ? 7 : 4);
    this.hero.actionUntil = this.time.now + 160;
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
        if (!this.wolf.alive) return;
        const dmg = Math.round(PARRY_DAMAGE * GRADE_DAMAGE[grade]);
        this.wolf.takeHit(dmg, 1, 120, 0, this.time.now);
        damageNumber(this, target.x, target.y - 100, dmg, grade);
        burst(this, target.x, target.y, { tint: [0xffe066, 0xffffff], count: 12, speed: 260 });
        gameAudio.play("hit");
        this.checkWolfDown();
      },
    });
  }

  // ---------------------------------------------------------------- damage / end
  protected extraTargets(): Hittable[] {
    return this.wolf?.alive ? [this.wolf] : [];
  }

  protected hitTarget(t: Hittable, move: Parameters<FightScene["hitTarget"]>[1], dmgMul: number, magMul: number, dir?: number, damageOverride?: number) {
    super.hitTarget(t, move, dmgMul, magMul, dir, damageOverride);
    if (t === this.wolf) this.checkWolfDown();
  }

  /** The super takes 15% of the wolf's health (it clears normal enemies outright). */
  protected superBossDamage(): number {
    return Math.round(this.wolf.maxHp * 0.15);
  }

  private checkWolfDown() {
    if (this.wolf.alive || this.ended) return;
    this.ended = true;
    const wolf = this.wolf;
    wolf.state = "defeated";
    for (const o of this.orbs) {
      this.destroyOrb(o);
      o.img.destroy();
    }
    this.orbs = [];
    this.music?.stop();
    gameAudio.play("victory");
    wolf.setTexture("bigwolf_hurt");
    this.cameras.main.flash(400, 255, 240, 200);
    popup(this, 640, 220, "The wolf runs off, never to huff again!", "#ffe066", 36, 2400);
    this.tweens.add({ targets: wolf, x: 1500, angle: 10, duration: 1600, ease: "Cubic.In", delay: 500 });
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 250, () =>
        burst(this, Phaser.Math.Between(200, 1080), Phaser.Math.Between(150, 400), { tint: [0xffe066, 0xff9ff3, 0x8fe36a, 0x58c7ff], count: 20, speed: 320 }),
      );
    }
    this.time.delayedCall(2800, () => this.finish(true));
  }

  protected hudExtra(): Partial<HudState> {
    let phaseLabel = "Choose the wolf's song";
    if (this.loading) phaseLabel = "Loading the song...";
    else if (this.started && this.song) {
      const { phase } = this.currentPhase(this.songNow().local);
      phaseLabel = phase.kind === "parry" ? "Parry: play each note as it arrives" : phase.kind === "free" ? "Strike back with combos!" : "Get ready...";
    } else if (this.song) phaseLabel = "Get ready...";
    return {
      boss: this.wolf ? { name: "The Big Bad Wolf", hp: this.wolf.hp, maxHp: this.wolf.maxHp, phase: phaseLabel } : null,
      objective: phaseLabel,
    };
  }

}
