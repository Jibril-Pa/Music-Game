/**
 * Drawing kit for the code-drawn art: storybook style, chunky dark outlines.
 * Used by art.ts (the forest) and art-worlds.ts (the other worlds).
 */

import type Phaser from "phaser";
import { defineArt } from "./art-pipeline";

export const OUT = 0x2b1a12;
export const LW = 5;

export type G = Phaser.GameObjects.Graphics;
export type P = { x: number; y: number };

export const pts = (...xy: number[]): P[] => {
  const out: P[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] });
  return out;
};

/** Room around "paper" sprites for their white cut-out edge (left, right and top; feet stay on the bottom). */
export const PAPER_PAD = 8;

/**
 * Draws once into a texture (skipped if it already exists). `paper` gives a
 * character the 2.5D storybook finish: soft light from the top-left, a white
 * paper edge and a lifted shadow, so it reads as a cut-out standing in the
 * 3D world. The finish is deliberately applied after drawing so every pose
 * in a character set gets exactly the same ink-and-paper treatment.
 */
export function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void, opts: { paper?: boolean } = {}) {
  const pad = opts.paper ? PAPER_PAD : 0;
  // Recorded, not drawn here: art-pipeline.ts uses the baked PNG or draws it at 2x (2D-fallback art at 1x).
  defineArt(scene, { key, w: w + pad * 2, h: h + pad, pad, draw, finish: pad ? paperize : undefined });
}

function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * The paper finish, on a canvas drawn at k x the logical size: every pixel-space
 * constant below is logical px x k, so a k x render is the same design at k times
 * the resolution (`npm run bake-art` checks it against the 1x render).
 */
export function paperize(src: HTMLCanvasElement, k: number) {
  const ctx = src.getContext("2d");
  if (!ctx) return;
  const w = src.width;
  const h = src.height;
  const lw = Math.round(w / k);
  const lh = Math.round(h / k);
  const orig = document.createElement("canvas");
  orig.width = w;
  orig.height = h;
  orig.getContext("2d")!.drawImage(src, 0, 0);
  // Volume: a warm top-left key light and cool lower shade give even the
  // small sprites a hand-painted dimensionality without blurring their ink.
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const grad = ctx.createLinearGradient(0, 0, w * 0.9, h);
  grad.addColorStop(0, "rgba(255,250,231,0.28)");
  grad.addColorStop(0.5, "rgba(255,247,228,0)");
  grad.addColorStop(1, "rgba(38,22,62,0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Sparse, deterministic paper fibres stop large flat colour areas from
  // reading as clip art. source-atop keeps them strictly inside the sprite.
  for (let i = 0; i < Math.max(18, Math.floor((lw * lh) / 260)); i++) {
    const x = (i * 47 + 19) % lw;
    const y = (i * 83 + 31) % lh;
    ctx.fillStyle = i % 3 === 0 ? "rgba(85,47,34,0.075)" : "rgba(255,250,226,0.12)";
    ctx.fillRect(x * k, y * k, (i % 5 === 0 ? 2 : 1) * k, k);
  }
  ctx.restore();
  // Behind the art: a warm paper edge, restrained ink rim, and a soft lifted
  // shadow. This makes allies, monsters and bosses read as one cohesive set.
  const white = silhouette(orig, "#fffaf0");
  const dark = silhouette(orig, "#1e0f0a");
  const gold = silhouette(orig, "#f1d79a");
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.globalAlpha = 0.52;
  ctx.drawImage(gold, -1.2 * k, -1.4 * k);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.drawImage(white, Math.cos(a) * 3.3 * k, Math.sin(a) * 3.3 * k);
  }
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.drawImage(dark, Math.cos(a) * 4.6 * k, Math.sin(a) * 4.6 * k);
  }
  ctx.globalAlpha = 0.2;
  ctx.filter = `blur(${2 * k}px)`;
  ctx.drawImage(dark, 5 * k, 3 * k);
  ctx.restore();
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
