/** Cheap game-feel helpers: popups, damage numbers, particle bursts, hit-stop. */

import Phaser from "phaser";
import type { Grade } from "@/lib/combat/rhythm";

export const FONT = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
export const GROUND_Y = 600;

const GRADE_COLOR: Record<Grade, string> = { perfect: "#ffd23f", good: "#ffffff", off: "#c9c9c9" };

export function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string, stroke = "#2b1a12") {
  return scene.add
    .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke, strokeThickness: Math.max(4, size / 6) })
    .setOrigin(0.5);
}

export function damageNumber(scene: Phaser.Scene, x: number, y: number, amount: number, grade: Grade | null, big = false) {
  const size = big ? 46 : grade === "perfect" ? 38 : 30;
  const t = text(scene, x + Phaser.Math.Between(-12, 12), y, `${Math.round(amount)}`, size, grade ? GRADE_COLOR[grade] : "#ffffff").setDepth(50);
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.Out" });
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 750, delay: 120, ease: "Cubic.In", onComplete: () => t.destroy() });
}

export function popup(scene: Phaser.Scene, x: number, y: number, s: string, color = "#ffffff", size = 32, ms = 700) {
  const t = text(scene, x, y, s, size, color).setDepth(60).setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: "Back.Out" });
  scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: ms, delay: 200, onComplete: () => t.destroy() });
  return t;
}

export function gradePopup(scene: Phaser.Scene, x: number, y: number, grade: Grade) {
  const label = grade === "perfect" ? "Perfect!" : grade === "good" ? "Good" : "Off";
  popup(scene, x, y, label, GRADE_COLOR[grade], grade === "perfect" ? 30 : grade === "good" ? 24 : 18, 500);
}

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
  scene.time.delayedCall(ms, () => s.active && s.clearTint());
}
