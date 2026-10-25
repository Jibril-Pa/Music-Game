/**
 * A walking level (auto-scroller) in any world. The bard walks east on their
 * own; foes come in from the right, each showing the chord(s) to play. Set
 * pieces block the path: the troll under the bridge, the gingerbread witch,
 * the giant down the beanstalk, Ali Baba's cave, the Sphinx, a laser gate,
 * the Clockwork Nightingale. Which level: session.level (see levels.ts).
 */

import Phaser from "phaser";
import { randomSymbols } from "@/lib/combat/spells";
import { gameAudio } from "@/lib/game-audio/audio";
import { ProceduralMusic } from "@/lib/game-audio/music";
import type { Enemy, EnemyKind } from "../entities/Enemy";
import { EventBus } from "../EventBus";
import { EV, type HudState } from "../events";
import { GROUND_Y, burst, light, popup } from "../fx";
import { LEVELS, WORLDS, levelAt, sceneFor, unlockLevel, type JourneyLevel, type SetPiece, type Spawn } from "../levels";
import { session } from "../state";
import { FightScene } from "./FightScene";
import { actorTint, showWorld } from "../stage";
import { THEMES, endSign, scatterProps, scrollingBackdrop } from "./worlds";

interface Blocker {
  e: Enemy;
  name: string;
  max: number;
  objective: string;
}

export class Journey extends FightScene {
  private level!: JourneyLevel;
  /** 2D fallback backdrop (only when 3D isn't available). */
  private backdrop: ReturnType<typeof scrollingBackdrop> | null = null;
  private schedule: (Spawn & { done: boolean })[] = [];
  private blocker: Blocker | null = null;
  private leaving = false;

  constructor() {
    super("Journey");
  }

  protected heroStartX() {
    return 200;
  }

  create() {
    const lv = levelAt(session.level);
    this.level = lv.kind === "journey" ? lv : (LEVELS[0] as JourneyLevel);
    const d = this.level.difficulty;
    this.worldWidth = this.level.length + 600;
    this.walkSpeed = d.walkSpeed;
    this.foeMods = { speed: d.foeSpeed, damage: d.foeDamage };
    this.toughness = d.toughness;
    this.stage = this.level.spawns[0]?.stage ?? 0;
    this.leaving = false;
    this.blocker = null;
    this.schedule = this.level.spawns.map((s) => ({ ...s, done: false }));
    super.create();
    this.cameras.main.startFollow(this.hero, true, 1, 1, -320, 0);

    this.music = new ProceduralMusic({ bpm: d.bpm, bars: 16, world: this.level.world });
    this.music.onBeat = (b) => EventBus.emit(EV.beat, b);
    this.music.start();
    this.titleCard();
  }

  /** "1-1 · The Enchanted Forest", with the era when you arrive in a new world. */
  private titleCard() {
    const lv = this.level;
    const w = WORLDS[lv.world];
    const firstOfWorld = LEVELS.findIndex((l) => l.world === lv.world) === session.level;
    if (firstOfWorld) popup(this, 640, 150, `${w.era}...`, "#ffd6a0", 30, 2600).setScrollFactor(0);
    popup(this, 640, 210, `${lv.id} · ${lv.name}`, "#ffe9a8", 52, 2000).setScrollFactor(0);
    const what = session.playMode === "chords" ? "chord" : "note";
    popup(this, 640, 270, firstOfWorld ? w.arrival : `Play the ${what} over each foe!`, "#fff6dc", 28, 2600).setScrollFactor(0);
  }

  protected buildWorld() {
    const lv = this.level;
    const in3d = showWorld(this, { world: lv.world, night: lv.night, kind: "journey", length: lv.length, landmarks: lv.landmarks, goal: lv.goal.sign });
    light.tint = in3d ? actorTint() : 0xffffff;
    this.backdrop = null;
    if (in3d) return;
    this.backdrop = scrollingBackdrop(this, lv.world, lv.night);
    scatterProps(this, lv.world, lv.night, this.worldWidth, Object.values(lv.landmarks));
    this.buildLandmarks();
    endSign(this, lv.length, lv.goal.sign, lv.world);
  }

  private mark(kind: SetPiece): number {
    return this.level.landmarks[kind] ?? this.hero.x + 700;
  }

  /** Scenery for the set pieces (the foes themselves appear when you get close). */
  private buildLandmarks() {
    const lv = this.level;
    const tint = lv.night ? THEMES[lv.world].nightTint : 0xffffff;
    for (const [kind, x] of Object.entries(lv.landmarks) as [SetPiece, number][]) {
      if (kind === "troll-bridge") {
        const water = this.add.graphics().setDepth(2);
        water.fillStyle(0x5ab4d6, 1).fillRect(x - 300, GROUND_Y - 4, 600, 140);
        water.fillStyle(0x9fdcf0, 1);
        for (let i = 0; i < 9; i++) water.fillRoundedRect(x - 280 + i * 64, GROUND_Y + 30 + (i % 3) * 26, 34, 6, 3);
        this.add.image(x, GROUND_Y - 64, "bridge").setOrigin(0.5, 0).setDepth(4).setTint(tint);
      } else if (kind === "witch-house") {
        this.add.image(x, GROUND_Y + 8, "ginger").setOrigin(0.5, 1).setDepth(2).setTint(tint);
      } else if (kind === "beanstalk") {
        this.add.image(x, GROUND_Y + 12, "beanstalk").setOrigin(0.5, 1).setDepth(2).setTint(lv.night ? 0xa8b0d8 : 0xffffff);
      } else if (kind === "sesame-cave") {
        this.add.image(x, GROUND_Y + 6, "cave").setOrigin(0.5, 1).setDepth(2).setTint(tint);
      }
    }
  }

  protected tickScene(_now: number, dt: number) {
    this.backdrop?.scroll(this.cameras.main, dt);
    if (this.ended || this.leaving) return;

    const hx = this.hero.x;
    for (const s of this.schedule) {
      if (s.done || hx < s.at) continue;
      s.done = true;
      this.stage = Math.max(this.stage, s.stage);
      this.spawn(s);
    }
    if (hx >= this.level.length - 40 && this.enemies.every((e) => !e.alive)) this.levelDone();
  }

  private spawnX() {
    return this.cameras.main.worldView.right + 70;
  }

  private spawn(s: Spawn) {
    switch (s.kind) {
      case "fairy":
        return this.spawnFairy();
      case "troll-bridge":
        return this.trollRises();
      case "witch-house":
        return this.witchAppears();
      case "beanstalk":
        return this.giantClimbsDown();
      case "wolf-pack":
        return this.wolfPack();
      case "sesame-cave":
        return this.sesame();
      case "sphinx":
        return this.sphinxAwakes();
      case "laser-gate":
        return this.laserGate();
      case "nightingale":
        return this.nightingaleSings();
      default:
        // Any foe may turn out tougher (2-3 chords), more often in harder levels.
        this.addEnemy(s.kind, this.spawnX());
    }
  }

  private block(e: Enemy, name: string, objective: string) {
    this.blocker = { e, name, max: e.symbols.length, objective };
  }

  /** Calls in `kind` every so often while `who` is alive. */
  private summon(who: Enemy, kind: EnemyKind, delays: number[]) {
    for (const delay of delays) {
      this.time.delayedCall(delay, () => {
        if (who.alive && !this.ended) this.addEnemy(kind, this.spawnX());
      });
    }
  }

  private headline(line: string, size = 40, color = "#ffd6a0") {
    popup(this, 640, 200, line, color, size, 2200).setScrollFactor(0);
  }

  // ---------------------------------------------------------------- set pieces
  private trollRises() {
    const x = this.mark("troll-bridge") - 260;
    const e = this.addEnemy("troll", x, randomSymbols(session.playMode, this.stage, 3));
    this.block(e, "Bridge Troll", "The troll blocks the bridge!");
    e.y = GROUND_Y + 200;
    e.body2.enable = false;
    this.headline("Who's that trip-trapping over my bridge?", 34);
    gameAudio.play("smash");
    this.cameras.main.shake(300, 0.008);
    burst(this, x, GROUND_Y, { tint: [0x9fdcf0, 0xffffff], count: 24, speed: 420, angle: { min: 220, max: 320 } });
    this.tweens.add({
      targets: e,
      y: GROUND_Y - 10,
      duration: 900,
      ease: "Back.Out",
      onComplete: () => {
        if (e.active) e.body2.enable = true;
      },
    });
  }

  private witchAppears() {
    const x = this.mark("witch-house") - 120;
    const e = this.addEnemy("witch", x, randomSymbols(session.playMode, this.stage, 2));
    this.block(e, "Gingerbread Witch", "The witch blocks the path!");
    e.setAlpha(0);
    this.tweens.add({ targets: e, alpha: 1, duration: 500 });
    burst(this, x, GROUND_Y - 80, { tint: [0xff7eb6, 0xffe066, 0x58c7ff], count: 20, speed: 260 });
    this.headline("The Gingerbread Witch!", 44);
    this.summon(e, "wolf", [5000, 11000, 17000]);
  }

  private giantClimbsDown() {
    const x = this.mark("beanstalk") - 40;
    const e = this.addEnemy("giant", x);
    this.block(e, "The Giant", "The giant climbed down the beanstalk!");
    e.y = -300;
    e.body2.enable = false;
    this.headline("Fee-fi-fo-fum!", 54);
    this.tweens.add({
      targets: e,
      y: GROUND_Y,
      duration: 1400,
      ease: "Quad.In",
      onComplete: () => {
        if (!e.active) return;
        e.body2.enable = true;
        gameAudio.play("smash");
        this.cameras.main.shake(350, 0.012);
        burst(this, x, GROUND_Y, { tint: [0x8a5a33, 0x6db34b], count: 20, speed: 320, angle: { min: 200, max: 340 } });
      },
    });
  }

  private wolfPack() {
    this.headline("Awooooo! A wolf pack!", 44);
    gameAudio.play("wind");
    const kinds: EnemyKind[] = ["wolf", "pup", "wolf", "pup", "wolf"];
    kinds.forEach((k, i) => this.time.delayedCall(i * 380, () => !this.ended && this.addEnemy(k, this.spawnX() + i * 30)));
  }

  private sesame() {
    const x = this.mark("sesame-cave");
    const door = this.addEnemy("cavedoor", x);
    this.block(door, "The Cave Door", "Open, Sesame! Play the chords on the door");
    this.headline("A cave sealed by magic... Open, Sesame!", 34);
    door.onSlain = () => {
      this.headline("The forty thieves' hideout! Here they come!", 32);
      for (let i = 0; i < 3; i++) this.time.delayedCall(250 + i * 450, () => !this.ended && this.addEnemy("thief", x + 20));
    };
  }

  private sphinxAwakes() {
    const x = this.mark("sphinx");
    const e = this.addEnemy("sphinx", x);
    this.block(e, "The Sphinx", "Answer the Sphinx's riddles: play its chords!");
    e.setAlpha(0);
    this.tweens.add({ targets: e, alpha: 1, duration: 700 });
    burst(this, x, GROUND_Y - 100, { tint: [0xf3c77e, 0xffffff], count: 26, speed: 320 });
    this.headline("The Sphinx: \"Answer my riddles... in chords!\"", 32);
    this.summon(e, "scorpion", [6000, 13000, 20000]);
  }

  private laserGate() {
    const x = this.mark("laser-gate");
    const e = this.addEnemy("lasergate", x);
    this.block(e, "Laser Gate", "Shut down the laser gate: play its chords!");
    this.headline("A laser gate! Play its chords to shut it down", 32);
    gameAudio.play("block");
    this.summon(e, "drone", [4000, 9000, 14000, 19000]);
  }

  private nightingaleSings() {
    const x = this.mark("nightingale");
    const e = this.addEnemy("nightingale", x);
    this.block(e, "The Clockwork Nightingale", "Its song is a trap: play its chords!");
    const hoverY = GROUND_Y - (e.def.altitude ?? 150);
    e.setBaseY(-260);
    e.y = -260;
    this.tweens.add({ targets: e, y: hoverY, duration: 1200, ease: "Back.Out", onUpdate: () => e.setBaseY(e.y), onComplete: () => e.setBaseY(hoverY) });
    this.headline("The Clockwork Nightingale sings!", 40);
    gameAudio.play("heal");
    this.summon(e, "drone", [5000, 11000, 17000]);
  }

  // ---------------------------------------------------------------- end of the level
  private levelDone() {
    this.leaving = true;
    this.music?.stop();
    const next = session.level + 1;
    unlockLevel(next);
    gameAudio.play("victory");
    popup(this, 640, 210, `${this.level.id} complete!`, "#ffe066", 52, 1600).setScrollFactor(0);
    popup(this, 640, 280, this.level.outro, "#ffd6a0", 34, 2000).setScrollFactor(0);
    this.time.delayedCall(1700, () => {
      this.cameras.main.fadeOut(700, 20, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        session.level = next;
        this.scene.start(sceneFor(next));
      });
    });
  }

  protected hudExtra(): Partial<HudState> {
    const what = session.playMode === "chords" ? "chord" : "note";
    let objective = `Play the ${what} over each foe →`;
    let enemy: HudState["enemy"] = null;
    const b = this.blocker;
    if (b?.e.alive) {
      objective = b.objective;
      enemy = { name: b.name, hp: b.e.symbols.length, maxHp: b.max };
    } else if (this.hero.x > this.level.length - 600) objective = `Almost there: ${this.level.goal.sign}`;
    return { enemy, objective, progress: Math.min(1, this.hero.x / this.level.length), goalIcon: this.level.goal.icon };
  }
}
