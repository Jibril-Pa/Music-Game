/**
 * Drawing kit for the code-drawn art: storybook style, chunky dark outlines.
 * Used by art.ts (the forest) and art-worlds.ts (the other worlds).
 */

import type Phaser from "phaser";

export const OUT = 0x2b1a12;
export const LW = 5;

export type G = Phaser.GameObjects.Graphics;
export type P = { x: number; y: number };

export const pts = (...xy: number[]): P[] => {
  const out: P[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] });
  return out;
};

/** Draws once into a texture (skipped if it already exists). */
export function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

// Outlined primitives ----------------------------------------------------------
export function circle(g: G, x: number, y: number, r: number, fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillCircle(x, y, r);
  if (lw) g.lineStyle(lw, OUT, 1).strokeCircle(x, y, r);
}
export function ellipse(g: G, x: number, y: number, w: number, h: number, fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillEllipse(x, y, w, h);
  if (lw) g.lineStyle(lw, OUT, 1).strokeEllipse(x, y, w, h);
}
export function rrect(g: G, x: number, y: number, w: number, h: number, r: number, fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, r);
  if (lw) g.lineStyle(lw, OUT, 1).strokeRoundedRect(x, y, w, h, r);
}
export function poly(g: G, p: P[], fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillPoints(p, true);
  if (lw) g.lineStyle(lw, OUT, 1).strokePoints(p, true, true);
}
export function line(g: G, x1: number, y1: number, x2: number, y2: number, w: number, color = OUT) {
  g.lineStyle(w, color, 1).lineBetween(x1, y1, x2, y2);
}
/** Thick stroke with an outline (necks, sticks, brooms). */
export function stick(g: G, x1: number, y1: number, x2: number, y2: number, w: number, fill: number) {
  line(g, x1, y1, x2, y2, w + LW * 2);
  line(g, x1, y1, x2, y2, w, fill);
}
/** A curved outlined stroke (blades, handles). Angles in radians. */
export function arcStroke(g: G, cx: number, cy: number, r: number, a0: number, a1: number, w: number, fill: number) {
  g.lineStyle(w + LW * 2, OUT, 1).beginPath().arc(cx, cy, r, a0, a1, false).strokePath();
  g.lineStyle(w, fill, 1).beginPath().arc(cx, cy, r, a0, a1, false).strokePath();
}

export function star(g: G, cx: number, cy: number, r: number, color: number) {
  const p: P[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    p.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.fillStyle(color, 1).fillPoints(p, true);
}

/** Rolling hills / dunes that tile seamlessly every `w` px. */
export function hills(g: G, w: number, h: number, color: number, amp: number, base: number, waves: number) {
  g.fillStyle(color, 1).beginPath().moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const y = base - amp * (0.6 * Math.sin((x / w) * Math.PI * 2 * waves) + 0.4 * Math.sin((x / w) * Math.PI * 2 * waves * 2 + 1));
    g.lineTo(x, y);
  }
  g.lineTo(w, h).closePath().fillPath();
}
