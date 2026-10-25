/** Cheap game-feel helpers: popups, paper plates, headlines, damage numbers, particle bursts, camera moves. */

import Phaser from "phaser";
import type { Grade } from "@/lib/combat/rhythm";
import { DISPLAY_FONT } from "./fonts";
import { session } from "./state";

/** Every canvas text: the storybook display face (Georgia when fonts.ts turns it off). */
export const FONT = DISPLAY_FONT;
export const GROUND_Y = 600;

/** The book's paper and ink (the DOM's --sb-* tokens) for Graphics. */
export const C = {
  ink: 0x2b1a12,
  ink2: 0x6b4e3a,
  paper: 0xfff6dc,
  parchment: 0xf6e7c1,
  rim: 0xfffaf0,
  gold: 0xffd25e,
  goldSoft: 0xfff1b8,
  heal: 0xffe9f5,
  rose: 0xc8553d,
};

/** The light the 2D characters stand in (set by each scene from its 3D world: moonlight, dusk...). */
export const light = { tint: 0xffffff };

/** Back to the world's light after a flash. */
export function restoreTint(s: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image) {
  if (light.tint === 0xffffff) s.clearTint();
  else s.setTint(light.tint);
}

const GRADE_COLOR: Record<Grade, string> = { perfect: "#ffd23f", good: "#ffffff", off: "#c9c9c9" };

/** An ink outline swallows a plain word space at small sizes; an en space keeps the gap. */
const EN_SPACE = " ";

/**
 * Outlined display text, centred. Under 40 px the outline is size/8 (at least 3) and word
 * spaces become en spaces; from 40 px it is size/6 (at least 4). `stroke = ""` draws none.
 */
export function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string, stroke = "#2b1a12", weight = "800") {
  const small = size < 40;
  const outline = stroke ? { stroke, strokeThickness: small ? Math.max(3, size / 8) : Math.max(4, size / 6) } : {};
  return scene.add
    .text(x, y, stroke && small ? s.replace(/ /g, EN_SPACE) : s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: weight, color, ...outline })
    .setOrigin(0.5);
}

// ------------------------------------------------------------------ reduced motion

/** prefers-reduced-motion (GameApp sets it): no shakes, zooms, pops or rises. */
export function reducedMotion(): boolean {
  return session.reducedMotion;
}

/** Camera shake; none under reduced motion. */
export function shake(scene: Phaser.Scene, ms: number, intensity: number) {
  if (!session.reducedMotion) scene.cameras.main.shake(ms, intensity);
}

/** Camera flash; at most 150 ms under reduced motion. */
export function flash(scene: Phaser.Scene, ms: number, r: number, g: number, b: number) {
  scene.cameras.main.flash(session.reducedMotion ? Math.min(150, ms) : ms, r, g, b);
}

/** Camera zoom; none under reduced motion (a zoom back to 1 just snaps). */
export function zoomTo(scene: Phaser.Scene, zoom: number, ms: number) {
  const cam = scene.cameras.main;
  if (!session.reducedMotion) cam.zoomTo(zoom, ms);
  else if (zoom === 1 && cam.zoom !== 1) {
    cam.zoomEffect.reset();
    cam.setZoom(1);
  }
}

/** A "no" shake for a plate: its contents go 0 → 5 → −5 → 3 → 0 px over 160 ms; none under reduced motion. */
const nudges = new WeakMap<Phaser.GameObjects.Container, { tween: Phaser.Tweens.Tween; restore: () => void }>();
export function nudge(scene: Phaser.Scene, plate: Phaser.GameObjects.Container) {
  if (session.reducedMotion || !plate.active) return;
  const running = nudges.get(plate);
  if (running) {
    running.tween.stop();
    running.restore();
  }
  // Shake the contents, not the container: scenes reposition chips every frame.
  const kids = plate.list as (Phaser.GameObjects.GameObject & { x: number })[];
  const base = kids.map((k) => k.x);
  const restore = () => kids.forEach((k, i) => (k.x = base[i]));
  const keys = [0, 5, -5, 3, 0];
  const s = { t: 0 };
  const tween = scene.tweens.add({
    targets: s,
    t: 1,
    duration: 160,
    onUpdate: () => {
      const f = s.t * 4;
      const i = Math.min(3, Math.floor(f));
      const dx = keys[i] + (keys[i + 1] - keys[i]) * (f - i);
      kids.forEach((k, j) => (k.x = base[j] + dx));
    },
    onComplete: () => {
      restore();
      nudges.delete(plate);
    },
  });
  nudges.set(plate, { tween, restore });
}

// ------------------------------------------------------------------ popups

/** A number flying off something that was hit: it rises, holds, then fades. */
export function damageNumber(scene: Phaser.Scene, x: number, y: number, amount: number, grade: Grade | null, big = false) {
  const size = big ? 46 : grade === "perfect" ? 38 : 30;
  const t = text(scene, x + Phaser.Math.Between(-12, 12), y, `${Math.round(amount)}`, size, grade ? GRADE_COLOR[grade] : "#ffffff").setDepth(50);
  if (!session.reducedMotion) {
    t.setScale(0.4);
    scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.Out" });
    scene.tweens.add({ targets: t, y: y - 70, duration: 750, ease: "Cubic.Out" });
  }
  scene.tweens.add({ targets: t, alpha: 0, delay: 570, duration: 300, onComplete: () => t.destroy() });
}

/**
 * Outlined text that pops in and rises 40 px. It stays fully opaque until 200 + 0.7·ms,
 * then fades over 0.3·ms (gone at ms + 200). Reduced motion: no pop, no rise.
 */
export function popup(scene: Phaser.Scene, x: number, y: number, s: string, color = "#ffffff", size = 32, ms = 700) {
  const t = text(scene, x, y, s, size, color).setDepth(60);
  if (!session.reducedMotion) {
    t.setScale(0.6);
    scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: "Back.Out" });
    scene.tweens.add({ targets: t, y: y - 40, duration: ms + 200, ease: "Cubic.Out" });
  }
  scene.tweens.add({ targets: t, alpha: 0, delay: 200 + 0.7 * ms, duration: 0.3 * ms, onComplete: () => t.destroy() });
  return t;
}

// ------------------------------------------------------------------ paper

export interface PlateStyle {
  fill?: number;
  line?: number;
  lineWidth?: number;
  radius?: number;
  /** The cut-out's white paper edge. */
  rim?: boolean;
  /** The soft ink shadow of a lifted cut-out (down-right, light from the top left). */
  shadow?: boolean;
}

/** A paper cut-out plate in vector (paperize() for live Graphics): shadow, paper rim, fill, ink line. */
export function paperPlate(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: PlateStyle = {}) {
  const { fill = C.parchment, line = C.ink, lineWidth = 3, radius = 12, rim = true, shadow = true } = style;
  if (shadow) g.fillStyle(C.ink, 0.3).fillRoundedRect(x + 1, y + 3, w + 6, h + 6, radius + 3);
  if (rim) g.fillStyle(C.rim, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, radius + 3);
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, radius);
  if (lineWidth > 0) g.lineStyle(lineWidth, line, 1).strokeRoundedRect(x, y, w, h, radius);
  return g;
}

export interface ChordPlate {
  /** The plate, the chord names, and the docked keycaps, centred on (0, 0). */
  parts: Phaser.GameObjects.GameObject[];
  w: number;
  h: number;
  /** Keycaps hang 14 px (big) / 10 px (small) below the plate. */
  keycaps: boolean;
}

/**
 * The gold chord plate over a foe (or a candy, a howl, the wolf...): one paper cut-out, ink
 * dividers between its chords (any order), and for keyboard players a keycap docked under each.
 */
export function chordPlate(scene: Phaser.Scene, symbols: string[], keys: string[], size: "big" | "small" = "big"): ChordPlate {
  const big = size === "big";
  const h = big ? 46 : 36;
  const names = symbols.map((s) => scene.add.text(0, 0, s, { fontFamily: FONT, fontSize: big ? "30px" : "22px", fontStyle: "800", color: "#2b1a12" }).setOrigin(0.5));
  const cells = names.map((t) => Math.max(big ? 50 : 40, t.width + 18));
  const w = cells.reduce((a, b) => a + b, 0);
  const plate = paperPlate(scene.add.graphics(), -w / 2, -h / 2, w, h, { fill: C.gold, lineWidth: 4, radius: 12 });
  const caps = scene.add.graphics();
  const capTexts: Phaser.GameObjects.Text[] = [];
  const [kw, kh, kpx] = big ? [22, 20, 14] : [18, 16, 12];
  let x = -w / 2;
  cells.forEach((cw, i) => {
    const cx = x + cw / 2;
    names[i].setPosition(cx, 0);
    if (i > 0) plate.lineStyle(2, C.ink, 1).lineBetween(x, -h / 2 + 7, x, h / 2 - 7);
    const key = keys[i];
    if (key) {
      const top = h / 2 - 6;
      caps.fillStyle(C.paper, 1).fillRoundedRect(cx - kw / 2, top, kw, kh, 5);
      caps.lineStyle(2, C.ink, 1).strokeRoundedRect(cx - kw / 2, top, kw, kh, 5);
      capTexts.push(scene.add.text(cx, top + kh / 2, key, { fontFamily: FONT, fontSize: `${kpx}px`, fontStyle: "800", color: "#2b1a12" }).setOrigin(0.5));
    }
    x += cw;
  });
  return { parts: [plate, ...names, caps, ...capTexts], w, h, keycaps: capTexts.length > 0 };
}

export type PlateTone = "paper" | "heal" | "super";
const TONE_FILL: Record<PlateTone, number> = { paper: C.paper, heal: C.heal, super: C.goldSoft };

export interface HeadlineOpts {
  sub?: string;
  tone?: PlateTone;
  /** Centre of the plate (screen px). */
  y?: number;
  /** How long it stays fully opaque (ms) before its 400 ms fade. */
  hold?: number;
  size?: number;
}

/** One headline lane per scene: a new headline replaces the one showing. */
const lanes = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/**
 * A narrator line or prompt on a paper plate, fixed to the screen at depth 70. It holds fully
 * opaque for `hold` ms, then fades over 400 ms. A new headline in the same scene fades the
 * previous one out in 150 ms, so they never stack.
 */
export function headline(scene: Phaser.Scene, title: string, opts: HeadlineOpts = {}) {
  const { sub, tone = "paper", y = 204, hold = 1500, size = 30 } = opts;
  const prev = lanes.get(scene);
  if (prev?.active) {
    scene.tweens.killTweensOf(prev);
    scene.tweens.add({ targets: prev, alpha: 0, duration: 150, onComplete: () => prev.destroy() });
  }
  const wrap = { width: 900 };
  const t = scene.add.text(0, 0, title, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "800", color: "#2b1a12", align: "center", wordWrap: wrap }).setOrigin(0.5, 0);
  const s = sub ? scene.add.text(0, 0, sub, { fontFamily: FONT, fontSize: "22px", fontStyle: "700", color: "#6b4e3a", align: "center", wordWrap: wrap }).setOrigin(0.5, 0) : null;
  const padX = 22;
  const padY = 12;
  const gap = 4;
  const w = Math.max(t.width, s?.width ?? 0) + 2 * padX;
  const h = t.height + (s ? gap + s.height : 0) + 2 * padY;
  t.setY(-h / 2 + padY);
  s?.setY(t.y + t.height + gap);
  const plate = paperPlate(scene.add.graphics(), -w / 2, -h / 2, w, h, { fill: TONE_FILL[tone] });
  const c = scene.add.container(640, y, s ? [plate, t, s] : [plate, t]).setScrollFactor(0).setDepth(70);
  lanes.set(scene, c);
  if (!session.reducedMotion) {
    c.setScale(0.9);
    scene.tweens.add({ targets: c, scale: 1, duration: 160, ease: "Back.Out" });
  }
  scene.tweens.add({
    targets: c,
    alpha: 0,
    delay: hold,
    duration: 400,
    onComplete: () => {
      if (lanes.get(scene) === c) lanes.delete(scene);
      c.destroy();
    },
  });
  return c;
}

// ------------------------------------------------------------------ particles and flashes

export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: { tint?: number | number[]; count?: number; speed?: number; texture?: string; scale?: number; lifespan?: number; gravityY?: number; angle?: { min: number; max: number } } = {},
) {
  const emitter = scene.add.particles(x, y, opts.texture ?? "spark", {
    speed: { min: (opts.speed ?? 260) * 0.4, max: opts.speed ?? 260 },
    angle: opts.angle ?? { min: 0, max: 360 },
    lifespan: opts.lifespan ?? 600,
    scale: { start: opts.scale ?? 0.9, end: 0 },
    rotate: { min: 0, max: 360 },
    gravityY: opts.gravityY ?? 300,
    tint: opts.tint ?? 0xffe066,
    emitting: false,
  });
  emitter.setDepth(55);
  emitter.explode(opts.count ?? 14);
  scene.time.delayedCall((opts.lifespan ?? 600) + 100, () => emitter.destroy());
}

export function flashSprite(scene: Phaser.Scene, s: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, color = 0xffffff, ms = 80) {
  s.setTintFill(color);
  scene.time.delayedCall(ms, () => s.active && restoreTint(s));
}
