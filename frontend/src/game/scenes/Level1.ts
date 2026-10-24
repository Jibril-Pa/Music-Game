/**
 * Level 1: the Enchanted Forest. Walk east; waves lock the screen until
 * cleared (wolves, goblins, the troll under the bridge, the gingerbread witch).
 */

import Phaser from "phaser";
import { gameAudio } from "@/lib/game-audio/audio";
import { ProceduralMusic } from "@/lib/game-audio/music";
import type { EnemyKind } from "../entities/Enemy";
import { EventBus } from "../EventBus";
import { EV, type HudState } from "../events";
import { GROUND_Y, burst, popup, text } from "../fx";
import { session } from "../state";
import { FightScene } from "./FightScene";

interface Spawn {
  kind: EnemyKind;
  from: "left" | "right" | "bridge" | "house";
  delay: number;
}
interface Wave {
  trigger: number;
  lock: [number, number];
  title: string;
  spawns: Spawn[];
  started?: boolean;
  done?: boolean;
}

const BRIDGE_X = 3650;
const HOUSE_X = 5350;
const END_X = 6750;

export class Level1 extends FightScene {
  private layers: { ts: Phaser.GameObjects.TileSprite; f: number }[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private waves: Wave[] = [];
  private active: Wave | null = null;
  private pendingSpawns = 0;
  private goArrow: Phaser.GameObjects.Text | null = null;
  private leaving = false;

  constructor() {
    super("Level1");
  }

  protected heroStartX() {
    return 220;
  }

  create() {
    this.worldWidth = 7000;
    this.layers = [];
    this.clouds = [];
    this.leaving = false;
    this.active = null;
    this.pendingSpawns = 0;
    this.waves = [
      { trigger: 820, lock: [520, 1800], title: "Wolves!", spawns: [{ kind: "wolf", from: "right", delay: 0 }, { kind: "wolf", from: "right", delay: 900 }, { kind: "wolf", from: "left", delay: 1800 }] },
      { trigger: 2250, lock: [1950, 3230], title: "Goblin ambush!", spawns: [{ kind: "goblin", from: "right", delay: 0 }, { kind: "goblin", from: "left", delay: 500 }, { kind: "wolf", from: "right", delay: 2500 }, { kind: "wolf", from: "right", delay: 3500 }, { kind: "wolf", from: "left", delay: 5000 }] },
      { trigger: 3420, lock: [3010, 4290], title: "Who's that trip-trapping over my bridge?", spawns: [{ kind: "troll", from: "bridge", delay: 300 }, { kind: "goblin", from: "right", delay: 5000 }] },
      { trigger: 5150, lock: [4710, 5990], title: "The Gingerbread Witch!", spawns: [{ kind: "witch", from: "house", delay: 400 }, { kind: "wolf", from: "right", delay: 1500 }, { kind: "goblin", from: "left", delay: 3500 }, { kind: "wolf", from: "right", delay: 6000 }, { kind: "goblin", from: "right", delay: 7500 }] },
    ];
    super.create();
    this.bounds = { left: 40, right: this.worldWidth - 40 };
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1, -120, 0);

    this.music = new ProceduralMusic({ bpm: 100, bars: 16, style: "forest" });
    this.music.onBeat = (b) => EventBus.emit(EV.beat, b);
    this.music.start();
    popup(this, 640, 220, "The Enchanted Forest", "#ffe9a8", 54, 1800).setScrollFactor(0);
  }

  protected buildWorld() {
    const W = this.worldWidth;
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-100);
    sky.fillGradientStyle(0xf9d9a6, 0xf9d9a6, 0xbfe0e0, 0xbfe0e0, 1).fillRect(0, 0, 1280, 720);
    this.add.circle(980, 150, 70, 0xfff1c4).setScrollFactor(0.02).setDepth(-99);
    for (let i = 0; i < 6; i++) {
      this.clouds.push(this.add.image(200 + i * 260, 80 + (i % 3) * 50, "cloud").setScrollFactor(0.06).setDepth(-98).setAlpha(0.9).setScale(0.7 + (i % 2) * 0.3));
    }
    const layer = (key: string, y: number, f: number, depth: number) => {
      const ts = this.add.tileSprite(0, y, 1280, this.textures.get(key).getSourceImage().height, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
      this.layers.push({ ts, f });
    };
    layer("hills_far", 160, 0.08, -90);
    layer("hills_mid", 210, 0.15, -85);
    layer("forest_far", 200, 0.3, -80);
    layer("forest_mid", 220, 0.5, -75);

    // ground
    this.add.tileSprite(0, GROUND_Y - 8, W, 150, "ground").setOrigin(0, 0).setDepth(1);

    // scenery (deterministic)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let x = 80; x < W; x += 180 + rnd() * 260) {
      if (Math.abs(x - BRIDGE_X) < 380 || Math.abs(x - HOUSE_X) < 260) continue;
      const kind = rnd() < 0.55 ? "tree" : "pine";
      const s = 0.75 + rnd() * 0.5;
      this.add.image(x, GROUND_Y + 6, kind).setOrigin(0.5, 1).setScale(s).setDepth(2).setTint(rnd() < 0.4 ? 0xd8e8c8 : 0xffffff);
      if (rnd() < 0.5) this.add.image(x + 70, GROUND_Y + 10, "mushroom").setOrigin(0.5, 1).setScale(0.6 + rnd() * 0.5).setDepth(3);
      if (rnd() < 0.6) this.add.image(x - 90, GROUND_Y + 14, "bush").setOrigin(0.5, 1).setScale(0.6 + rnd() * 0.4).setDepth(3);
    }

    // river + bridge (the troll lives under it)
    const water = this.add.graphics().setDepth(2);
    water.fillStyle(0x5ab4d6, 1).fillRect(BRIDGE_X - 300, GROUND_Y - 4, 600, 140);
    water.fillStyle(0x9fdcf0, 1);
    for (let i = 0; i < 9; i++) water.fillRoundedRect(BRIDGE_X - 280 + i * 64, GROUND_Y + 30 + (i % 3) * 26, 34, 6, 3);
    this.add.image(BRIDGE_X, GROUND_Y - 64, "bridge").setOrigin(0.5, 0).setDepth(4);

    // gingerbread house
    this.add.image(HOUSE_X, GROUND_Y + 8, "ginger").setOrigin(0.5, 1).setDepth(2);

    // signpost to the boss
    const sign = this.add.graphics().setDepth(3);
    sign.fillStyle(0x6b4226, 1).fillRect(END_X - 8, GROUND_Y - 150, 16, 150);
    sign.fillStyle(0xc89055, 1).fillRoundedRect(END_X - 110, GROUND_Y - 170, 220, 56, 8);
    sign.lineStyle(5, 0x2b1a12, 1).strokeRoundedRect(END_X - 110, GROUND_Y - 170, 220, 56, 8);
    text(this, END_X, GROUND_Y - 142, "Three Little Pigs →", 22, "#2b1a12", "#c89055").setDepth(4);

    // foreground bushes (parallax in front of the action)
    for (let x = 300; x < W + 600; x += 700 + rnd() * 400) {
      this.add.image(x, 760, "bush").setOrigin(0.5, 1).setScale(1.4).setScrollFactor(1.2).setDepth(40).setTint(0x9cc890);
    }
  }

  protected tickScene(now: number, dt: number) {
    const cam = this.cameras.main;
    for (const l of this.layers) l.ts.tilePositionX = cam.scrollX * l.f;
    for (const c of this.clouds) {
      c.x -= dt * 0.006;
      if (c.x < -150) c.x += 1600;
    }
    if (this.ended || this.leaving) return;
    const hx = this.hero.x;

    if (!this.active) {
      const next = this.waves.find((w) => !w.done);
      if (next && hx >= next.trigger) this.startWave(next);
      else if (!next && hx >= END_X) this.toBoss();
    } else if (this.pendingSpawns === 0 && this.enemies.every((e) => !e.alive)) {
      this.endWave(this.active);
    }
    if (this.goArrow) this.goArrow.setAlpha(0.6 + Math.sin(now / 150) * 0.4);
  }

  private startWave(w: Wave) {
    w.started = true;
    this.active = w;
    this.goArrow?.destroy();
    this.goArrow = null;
    const [l, r] = w.lock;
    this.cameras.main.stopFollow();
    this.tweens.add({ targets: this.cameras.main, scrollX: l, duration: 400, ease: "Sine.Out" });
    this.bounds = { left: l + 40, right: r - 40 };
    popup(this, 640, 200, w.title, "#ffd6a0", w.title.length > 24 ? 34 : 46, 1600).setScrollFactor(0);
    this.pendingSpawns = w.spawns.length;
    for (const s of w.spawns) {
      this.time.delayedCall(s.delay, () => {
        this.spawn(s, l, r);
        this.pendingSpawns--;
      });
    }
  }

  private spawn(s: Spawn, l: number, r: number) {
    if (this.ended) return;
    if (s.from === "bridge") {
      const e = this.addEnemy(s.kind, BRIDGE_X + 120);
      e.y = GROUND_Y + 200;
      e.body2.enable = false;
      gameAudio.play("smash");
      this.cameras.main.shake(300, 0.008);
      burst(this, e.x, GROUND_Y, { tint: [0x9fdcf0, 0xffffff], count: 24, speed: 420, angle: { min: 220, max: 320 } });
      this.tweens.add({
        targets: e,
        y: GROUND_Y - 10,
        duration: 900,
        ease: "Back.Out",
        onComplete: () => {
          if (e.active) e.body2.enable = true;
        },
      });
      return;
    }
    const x = s.from === "left" ? l - 60 : s.from === "right" ? r + 60 : HOUSE_X + 60;
    const e = this.addEnemy(s.kind, x);
    if (s.from === "house") {
      e.setAlpha(0);
      this.tweens.add({ targets: e, alpha: 1, duration: 500 });
      burst(this, x, GROUND_Y - 80, { tint: [0xff7eb6, 0xffe066, 0x58c7ff], count: 20, speed: 260 });
    }
  }

  private endWave(w: Wave) {
    w.done = true;
    this.active = null;
    this.bounds = { left: 40, right: this.worldWidth - 40 };
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1, -120, 0);
    const last = this.waves.every((x) => x.done);
    popup(this, 640, 220, last ? "The forest is safe!" : "Cleared!", "#b8f5a0", 44, 1200).setScrollFactor(0);
    this.goArrow = text(this, 1180, 330, "GO →", 48, "#ffe9a8").setScrollFactor(0).setDepth(90);
  }

  private toBoss() {
    this.leaving = true;
    this.music?.stop();
    popup(this, 640, 260, "The Big Bad Wolf awaits...", "#ffd6a0", 44, 1600).setScrollFactor(0);
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(700, 20, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start("Boss"));
    });
  }

  protected hudExtra(): Partial<HudState> {
    const alive = this.enemies.filter((e) => e.alive);
    const strongest = alive.sort((a, b) => b.def.hp - a.def.hp)[0];
    const done = this.waves.filter((w) => w.done).length;
    return {
      enemy: strongest && strongest.def.hp >= 90 ? { name: strongest.def.name, hp: Math.max(0, strongest.hp), maxHp: strongest.def.hp } : null,
      objective: this.active
        ? `Defeat the enemies (${alive.length + this.pendingSpawns} left)`
        : done === this.waves.length
          ? "Follow the sign to the Big Bad Wolf →"
          : `Walk east → (wave ${done + 1} of ${this.waves.length})`,
    };
  }

  /** Practice is read per note from the session. */
  get practice() {
    return session.practice;
  }
}
