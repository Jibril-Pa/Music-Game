/**
 * All art is drawn in code at boot (original, no external assets):
 * storybook style, chunky dark outlines, warm palette.
 * Characters face right; scenes flip them.
 */

import type Phaser from "phaser";

export const OUT = 0x2b1a12;
const LW = 5;
export const PALETTE = {
  skyTop: 0xf9d9a6,
  skyBottom: 0xbfe0e0,
  grass: 0x6db34b,
  grassDark: 0x4e8f37,
  dirt: 0x8a5a33,
  dirtDark: 0x6b4226,
  leaf: 0x5fa548,
  leafDark: 0x3f7e35,
  trunk: 0x7a4a26,
  gold: 0xf2c14e,
  cream: 0xf6e7c1,
  red: 0xc8553d,
};

type G = Phaser.GameObjects.Graphics;
type P = { x: number; y: number };
const pts = (...xy: number[]): P[] => {
  const out: P[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ x: xy[i], y: xy[i + 1] });
  return out;
};

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

// Outlined primitives -----------------------------------------------------------
function circle(g: G, x: number, y: number, r: number, fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillCircle(x, y, r);
  if (lw) g.lineStyle(lw, OUT, 1).strokeCircle(x, y, r);
}
function ellipse(g: G, x: number, y: number, w: number, h: number, fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillEllipse(x, y, w, h);
  if (lw) g.lineStyle(lw, OUT, 1).strokeEllipse(x, y, w, h);
}
function rrect(g: G, x: number, y: number, w: number, h: number, r: number, fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, r);
  if (lw) g.lineStyle(lw, OUT, 1).strokeRoundedRect(x, y, w, h, r);
}
function poly(g: G, p: P[], fill: number, lw = LW) {
  g.fillStyle(fill, 1).fillPoints(p, true);
  if (lw) g.lineStyle(lw, OUT, 1).strokePoints(p, true, true);
}
function line(g: G, x1: number, y1: number, x2: number, y2: number, w: number, color = OUT) {
  g.lineStyle(w, color, 1).lineBetween(x1, y1, x2, y2);
}
/** Thick stroke with an outline (necks, sticks, brooms). */
function stick(g: G, x1: number, y1: number, x2: number, y2: number, w: number, fill: number) {
  line(g, x1, y1, x2, y2, w + LW * 2);
  line(g, x1, y1, x2, y2, w, fill);
}

// ------------------------------------------------------------------- hero
function hero(g: G, pose: "idle" | "walk" | "attack" | "hurt") {
  const skin = 0xf2c49b;
  // cape
  poly(g, pts(34, 62, 62, 62, 72, 120, 20, 122), 0xb8452c);
  // legs
  if (pose === "walk") {
    stick(g, 44, 100, 34, 128, 10, 0x4a3426);
    stick(g, 58, 100, 68, 126, 10, 0x4a3426);
    rrect(g, 24, 122, 18, 11, 4, 0x6b4226);
    rrect(g, 62, 120, 18, 11, 4, 0x6b4226);
  } else {
    stick(g, 44, 100, 42, 126, 10, 0x4a3426);
    stick(g, 58, 100, 60, 126, 10, 0x4a3426);
    rrect(g, 34, 122, 18, 11, 4, 0x6b4226);
    rrect(g, 54, 122, 18, 11, 4, 0x6b4226);
  }
  // torso
  rrect(g, 32, 58, 40, 48, 12, 0x3f8f4f);
  g.fillStyle(0x6b4226, 1).fillRect(34, 92, 36, 6);
  circle(g, 52, 95, 4, PALETTE.gold, 3);
  // head + hair + hat
  circle(g, 46, 40, 18, 0x6b3f22);
  circle(g, 54, 43, 16, skin);
  g.fillStyle(OUT, 1).fillCircle(61, 40, 3);
  g.fillStyle(0xe8897a, 0.7).fillCircle(62, 48, 3.5);
  line(g, 58, 51, 64, 50, 2.5);
  poly(g, pts(16, 4, 30, 12, 44, 22, 30, 20, 20, 14), PALETTE.gold, 3); // feather
  poly(g, pts(30, 30, 76, 30, 66, 14, 40, 12), 0x9c2f2f);
  ellipse(g, 54, 31, 52, 10, 0x7d2424, 4);
  // lute
  const swing = pose === "attack";
  if (swing) {
    stick(g, 64, 80, 104, 70, 6, 0x7a4a24);
    rrect(g, 98, 62, 12, 10, 3, 0x5a3418, 3);
    ellipse(g, 62, 84, 32, 26, 0xc07a35);
    circle(g, 64, 82, 5, OUT, 0);
    circle(g, 92, 72, 6, skin, 3);
  } else {
    stick(g, 64, 84, 92, 56, 6, 0x7a4a24);
    rrect(g, 88, 48, 12, 10, 3, 0x5a3418, 3);
    ellipse(g, 58, 88, 32, 26, 0xc07a35);
    circle(g, 60, 87, 5, OUT, 0);
    circle(g, 82, 66, 6, skin, 3);
  }
  if (pose === "hurt") {
    g.fillStyle(0xffffff, 0.35).fillRect(0, 0, 110, 140);
  }
}

// ------------------------------------------------------------------- enemies
function wolf(g: G, open = false) {
  poly(g, pts(12, 40, 30, 46, 34, 58, 8, 60, 2, 50), 0x5d6a7e); // tail
  stick(g, 34, 60, 30, 84, 9, 0x4d586a);
  stick(g, 48, 62, 50, 84, 9, 0x5d6a7e);
  stick(g, 80, 62, 82, 84, 9, 0x4d586a);
  stick(g, 94, 60, 96, 84, 9, 0x5d6a7e);
  ellipse(g, 62, 52, 84, 42, 0x6f7d92);
  ellipse(g, 66, 62, 48, 14, 0x9aa6b8, 0);
  poly(g, pts(90, 24, 96, 4, 104, 22), 0x5d6a7e, 4);
  poly(g, pts(102, 24, 114, 8, 114, 28), 0x5d6a7e, 4);
  circle(g, 102, 38, 20, 0x6f7d92);
  poly(g, open ? pts(110, 30, 134, 32, 126, 40, 112, 44, 132, 50, 110, 52) : pts(110, 30, 134, 38, 112, 50), 0x7f8ca0, 4);
  circle(g, 131, 37, 4, OUT, 0);
  circle(g, 104, 33, 5, 0xffd34d, 3);
  g.fillStyle(OUT, 1).fillCircle(106, 33, 2);
}

function goblin(g: G) {
  stick(g, 34, 70, 30, 94, 8, 0x4f8a36);
  stick(g, 48, 70, 52, 94, 8, 0x4f8a36);
  rrect(g, 22, 50, 38, 32, 10, 0x6fae4c);
  poly(g, pts(22, 74, 60, 74, 56, 88, 26, 88), 0x7a5230, 4);
  poly(g, pts(14, 26, 30, 30, 26, 40), 0x6fae4c, 4); // ear
  poly(g, pts(70, 22, 56, 30, 60, 40), 0x6fae4c, 4);
  circle(g, 44, 36, 19, 0x7cc25a);
  circle(g, 52, 32, 5, 0xfff07a, 3);
  g.fillStyle(0xc0392b, 1).fillCircle(53, 32, 2.5);
  poly(g, pts(58, 36, 70, 42, 58, 44), 0x6fae4c, 3); // nose
  line(g, 44, 46, 56, 48, 3);
  stick(g, 60, 64, 82, 22, 7, 0x8a5a33); // club
  circle(g, 82, 20, 9, 0x8a5a33);
}

function troll(g: G, raised = false) {
  stick(g, 60, 150, 52, 186, 18, 0x5d6e44);
  stick(g, 108, 150, 116, 186, 18, 0x5d6e44);
  ellipse(g, 86, 112, 124, 104, 0x7c8f5c);
  g.fillStyle(0x5d6e44, 1).fillCircle(60, 96, 9).fillCircle(104, 130, 11).fillCircle(78, 140, 6);
  poly(g, pts(46, 130, 128, 130, 120, 160, 52, 160), 0x6b4a2a, 4);
  circle(g, 102, 52, 30, 0x8ea36a);
  ellipse(g, 128, 60, 26, 18, 0x9cb276);
  circle(g, 108, 42, 5, 0xfff07a, 3);
  g.fillStyle(OUT, 1).fillCircle(110, 42, 2.5);
  poly(g, pts(100, 72, 106, 62, 110, 72), 0xf6e7c1, 3); // tusk
  if (raised) {
    stick(g, 130, 100, 150, 20, 12, 0x6b4226);
    ellipse(g, 152, 16, 30, 26, 0x6b4226);
  } else {
    stick(g, 130, 110, 166, 150, 12, 0x6b4226);
    ellipse(g, 168, 154, 30, 26, 0x6b4226);
  }
  circle(g, 132, 106, 12, 0x8ea36a);
}

function witch(g: G) {
  stick(g, 4, 128, 96, 112, 5, 0x8a5a33); // broom
  poly(g, pts(0, 120, 14, 112, 18, 136, 2, 140), 0xd6a447, 4);
  poly(g, pts(32, 66, 66, 66, 84, 132, 14, 132), 0x5b3b8c);
  poly(g, pts(14, 120, 84, 120, 84, 132, 14, 132), 0x3e2766, 3);
  circle(g, 50, 52, 16, 0x9fd27a);
  poly(g, pts(62, 50, 76, 58, 62, 60), 0x8cc266, 3);
  circle(g, 56, 48, 4, 0xffffff, 2);
  g.fillStyle(OUT, 1).fillCircle(57, 48, 2);
  g.lineStyle(4, 0xdddddd, 1).lineBetween(36, 46, 30, 70).lineBetween(40, 48, 36, 74);
  ellipse(g, 50, 40, 60, 10, 0x2a1f3d, 4);
  poly(g, pts(30, 38, 70, 38, 60, 4, 54, 0), 0x2a1f3d);
  g.fillStyle(0xd94f8c, 1).fillRect(32, 30, 36, 5);
  circle(g, 80, 84, 9, 0xff7eb6, 3); // candy in hand
}

function bigWolf(g: G, pose: "idle" | "huff" | "hurt") {
  const fur = 0x4f5866;
  const furLight = 0x9aa3b1;
  // tail
  poly(g, pts(40, 200, 10, 170, 2, 200, 30, 230), fur);
  // legs + trousers
  stick(g, 104, 240, 96, 300, 24, 0x6b4a2a);
  stick(g, 160, 240, 170, 300, 24, 0x5a3c20);
  poly(g, pts(84, 296, 116, 296, 120, 314, 74, 314), fur, 4);
  poly(g, pts(156, 296, 190, 296, 196, 314, 152, 314), fur, 4);
  poly(g, pts(84, 230, 186, 230, 180, 262, 90, 262), 0x6b4a2a, 4);
  // torso + vest
  ellipse(g, 134, 182, 130, 140, fur);
  ellipse(g, 144, 186, 70, 96, furLight, 0);
  poly(g, pts(82, 130, 112, 120, 112, 236, 86, 230), 0x6b4a8c, 4);
  poly(g, pts(184, 130, 160, 120, 162, 236, 186, 228), 0x6b4a8c, 4);
  g.fillStyle(0xf2c14e, 1).fillCircle(170, 160, 4).fillCircle(170, 190, 4);
  // arms
  if (pose === "huff") {
    stick(g, 100, 150, 70, 110, 22, fur);
    stick(g, 180, 150, 214, 112, 22, fur);
  } else {
    stick(g, 98, 150, 84, 222, 22, fur);
    stick(g, 182, 150, 214, 214, 22, fur);
  }
  // head
  poly(g, pts(110, 66, 118, 22, 136, 58), fur); // ears
  poly(g, pts(146, 58, 168, 18, 172, 64), fur);
  poly(g, pts(124, 30, 128, 50, 120, 50), 0xd98c8c, 0);
  circle(g, 146, 86, 46, fur);
  if (pose === "huff") {
    ellipse(g, 206, 94, 70, 46, furLight); // puffed cheeks + snout
    circle(g, 238, 92, 10, OUT, 0);
    ellipse(g, 236, 94, 18, 22, 0x3a0d12, 3);
  } else {
    poly(g, pts(170, 72, 250, 86, 246, 98, 172, 112), furLight);
    poly(g, pts(176, 104, 240, 100, 230, 118, 184, 120), 0x3a0d12, 4); // jaw
    g.fillStyle(0xffffff, 1).fillTriangle(196, 104, 202, 104, 199, 112).fillTriangle(214, 103, 220, 103, 217, 111).fillTriangle(204, 118, 210, 118, 207, 111);
    circle(g, 248, 90, 8, OUT, 0);
  }
  circle(g, 160, 74, 9, pose === "hurt" ? 0xffffff : 0xff3b3b, 3);
  g.fillStyle(OUT, 1).fillCircle(163, 74, 3.5);
  line(g, 146, 60, 172, 64, 5); // brow
}

// ------------------------------------------------------------------- scenery
function tree(g: G) {
  poly(g, pts(96, 300, 104, 170, 124, 170, 132, 300), PALETTE.trunk);
  line(g, 112, 230, 120, 260, 4);
  circle(g, 70, 140, 52, PALETTE.leafDark);
  circle(g, 158, 140, 52, PALETTE.leafDark);
  circle(g, 114, 92, 66, PALETTE.leaf);
  circle(g, 76, 150, 44, PALETTE.leaf, 0);
  circle(g, 152, 150, 44, PALETTE.leaf, 0);
  g.fillStyle(0x86c75e, 1).fillCircle(96, 72, 16).fillCircle(140, 108, 12);
  g.fillStyle(PALETTE.red, 1).fillCircle(80, 120, 6).fillCircle(150, 86, 6).fillCircle(124, 140, 6);
}

function pine(g: G) {
  g.fillStyle(PALETTE.trunk, 1).fillRect(70, 250, 20, 50);
  g.lineStyle(LW, OUT).strokeRect(70, 250, 20, 50);
  poly(g, pts(80, 150, 150, 260, 10, 260), 0x2f6b3d);
  poly(g, pts(80, 90, 140, 190, 20, 190), 0x3a7d48);
  poly(g, pts(80, 30, 124, 120, 36, 120), 0x47905a);
}

function bush(g: G) {
  circle(g, 40, 56, 30, PALETTE.leafDark);
  circle(g, 120, 56, 30, PALETTE.leafDark);
  circle(g, 80, 44, 38, PALETTE.leaf);
  g.fillStyle(0xf28fb0, 1).fillCircle(60, 36, 5).fillCircle(100, 30, 5).fillCircle(124, 50, 5);
}

function mushroom(g: G) {
  rrect(g, 24, 34, 18, 24, 6, PALETTE.cream);
  g.fillStyle(PALETTE.red, 1).fillEllipse(33, 30, 56, 34);
  g.lineStyle(LW, OUT).strokeEllipse(33, 30, 56, 34);
  g.fillStyle(0xffffff, 1).fillCircle(22, 26, 5).fillCircle(40, 20, 4).fillCircle(46, 32, 4);
}

function ground(g: G, w: number, h: number) {
  g.fillStyle(PALETTE.dirt, 1).fillRect(0, 22, w, h - 22);
  g.fillStyle(PALETTE.dirtDark, 1);
  for (let x = 20; x < w; x += 64) g.fillEllipse(x, 70 + ((x * 7) % 30), 22, 12);
  g.fillStyle(PALETTE.grassDark, 1).fillRect(0, 10, w, 22);
  g.fillStyle(PALETTE.grass, 1).fillRect(0, 0, w, 24);
  for (let x = 0; x <= w; x += 32) g.fillCircle(x + 16, 26, 14);
  g.lineStyle(4, OUT, 1).beginPath();
  for (let x = 0; x <= w; x += 32) g.arc(x + 16, 26, 14, 0, Math.PI, false);
  g.strokePath();
  g.lineStyle(LW, OUT, 1).lineBetween(0, 1, w, 1);
}

function hills(g: G, w: number, h: number, color: number, amp: number, base: number, waves: number) {
  g.fillStyle(color, 1).beginPath().moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const y = base - amp * (0.6 * Math.sin((x / w) * Math.PI * 2 * waves) + 0.4 * Math.sin((x / w) * Math.PI * 2 * waves * 2 + 1));
    g.lineTo(x, y);
  }
  g.lineTo(w, h).closePath().fillPath();
}

function forestSilhouette(g: G, w: number, h: number, color: number, step: number, top: number) {
  g.fillStyle(color, 1);
  g.fillRect(0, top + 80, w, h - top - 80);
  for (let x = 0; x < w + step; x += step) {
    const r = 40 + ((x * 37) % 30);
    g.fillCircle(x, top + 90 - ((x * 13) % 40), r);
    if ((x / step) % 3 === 1) g.fillTriangle(x - 30, top + 90, x + 30, top + 90, x, top - 40);
  }
}

function cloud(g: G) {
  g.fillStyle(0xfff8ec, 1).fillCircle(60, 56, 30).fillCircle(100, 40, 36).fillCircle(144, 54, 28).fillRect(56, 54, 92, 30);
  g.lineStyle(4, OUT, 0.25).strokeCircle(100, 40, 36);
}

function bridge(g: G) {
  // rails
  stick(g, 0, 20, 600, 20, 8, 0x8a5a33);
  for (let x = 20; x < 600; x += 80) stick(g, x, 20, x, 70, 10, 0x7a4a26);
  // planks
  for (let x = 0; x < 600; x += 40) rrect(g, x + 2, 64, 36, 22, 4, x % 80 ? 0xa06a3a : 0x8f5d31, 4);
  // arch underneath
  g.lineStyle(10, OUT, 1).beginPath().arc(300, 220, 220, Math.PI * 1.15, Math.PI * 1.85, false).strokePath();
  g.lineStyle(6, 0x7a4a26, 1).beginPath().arc(300, 220, 220, Math.PI * 1.15, Math.PI * 1.85, false).strokePath();
}

function gingerHouse(g: G) {
  rrect(g, 40, 130, 280, 180, 8, 0xb4703a);
  // roof with icing
  poly(g, pts(20, 140, 180, 20, 340, 140), 0x8a4f26);
  g.lineStyle(10, 0xffffff, 1).beginPath();
  for (let i = 0; i <= 8; i++) {
    const x = 20 + i * 40;
    const y = 140 - (i <= 4 ? i * 30 : (8 - i) * 30);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
  // windows, door, candy
  rrect(g, 70, 170, 60, 56, 8, 0xffe9a8);
  line(g, 100, 170, 100, 226, 4);
  line(g, 70, 198, 130, 198, 4);
  rrect(g, 210, 200, 70, 110, 30, 0x6b3a1c);
  circle(g, 266, 258, 6, PALETTE.gold, 3);
  const candy = [0xff5f7e, 0x58c7ff, 0xffe066, 0x8fe36a, 0xff9ff3];
  for (let i = 0; i < 9; i++) circle(g, 60 + i * 30, 132, 9, candy[i % candy.length], 3);
  for (let i = 0; i < 5; i++) circle(g, 160, 170 + i * 26, 7, candy[(i + 2) % candy.length], 3);
  // candy cane
  stick(g, 30, 310, 30, 200, 10, 0xffffff);
  g.lineStyle(10, 0xffffff, 1).beginPath().arc(46, 200, 16, Math.PI, 0, false).strokePath();
  for (let y = 210; y < 310; y += 22) line(g, 25, y, 35, y + 10, 5, 0xe23d5a);
}

function pigHouse(g: G, kind: "straw" | "sticks" | "bricks") {
  const wall = kind === "straw" ? 0xe8c15a : kind === "sticks" ? 0x9a6a3c : 0xb5503c;
  const roof = kind === "straw" ? 0xd9a93a : kind === "sticks" ? 0x7a4a26 : 0x7d2f24;
  rrect(g, 30, 110, 200, 130, 6, wall);
  if (kind === "straw") for (let x = 40; x < 230; x += 12) line(g, x, 116, x - 4, 236, 2, 0xb8902c);
  if (kind === "sticks") for (let y = 124; y < 236; y += 18) line(g, 34, y, 226, y + 4, 4, 0x6b4226);
  if (kind === "bricks") {
    for (let y = 120; y < 236; y += 20) for (let x = 34 + ((y / 20) % 2) * 15; x < 220; x += 30) g.lineStyle(3, 0x7a2e22, 1).strokeRect(x, y, 30, 20);
  }
  poly(g, pts(14, 120, 130, 20, 246, 120), roof);
  rrect(g, 110, 170, 44, 70, 18, 0x5a3418);
  rrect(g, 50, 140, 40, 34, 6, 0xffe9a8);
}

// ------------------------------------------------------------------- fx
function star(g: G, cx: number, cy: number, r: number, color: number) {
  const p: P[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    p.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.fillStyle(color, 1).fillPoints(p, true);
}

export function buildTextures(scene: Phaser.Scene) {
  make(scene, "hero", 110, 140, (g) => hero(g, "idle"));
  make(scene, "hero_walk", 110, 140, (g) => hero(g, "walk"));
  make(scene, "hero_attack", 116, 140, (g) => hero(g, "attack"));
  make(scene, "wolf", 140, 92, (g) => wolf(g));
  make(scene, "wolf_bite", 140, 92, (g) => wolf(g, true));
  make(scene, "goblin", 96, 100, goblin);
  make(scene, "troll", 190, 192, (g) => troll(g));
  make(scene, "troll_raise", 190, 192, (g) => troll(g, true));
  make(scene, "witch", 100, 144, witch);
  make(scene, "bigwolf", 260, 320, (g) => bigWolf(g, "idle"));
  make(scene, "bigwolf_huff", 260, 320, (g) => bigWolf(g, "huff"));
  make(scene, "bigwolf_hurt", 260, 320, (g) => bigWolf(g, "hurt"));

  make(scene, "tree", 230, 302, tree);
  make(scene, "pine", 160, 302, pine);
  make(scene, "bush", 160, 90, bush);
  make(scene, "mushroom", 70, 64, mushroom);
  make(scene, "ground", 256, 140, (g) => ground(g, 256, 140));
  make(scene, "cloud", 200, 90, cloud);
  make(scene, "bridge", 600, 230, bridge);
  make(scene, "ginger", 360, 314, gingerHouse);
  make(scene, "house_straw", 260, 244, (g) => pigHouse(g, "straw"));
  make(scene, "house_sticks", 260, 244, (g) => pigHouse(g, "sticks"));
  make(scene, "house_bricks", 260, 244, (g) => pigHouse(g, "bricks"));
  make(scene, "hills_far", 1280, 360, (g) => hills(g, 1280, 360, 0xa8c8a0, 50, 200, 2));
  make(scene, "hills_mid", 1280, 360, (g) => hills(g, 1280, 360, 0x86b07a, 60, 230, 3));
  make(scene, "forest_far", 1280, 420, (g) => forestSilhouette(g, 1280, 420, 0x4d7a5a, 70, 160));
  make(scene, "forest_mid", 1280, 460, (g) => forestSilhouette(g, 1280, 460, 0x356247, 110, 170));

  make(scene, "spark", 32, 32, (g) => star(g, 16, 16, 15, 0xffffff));
  make(scene, "dot", 16, 16, (g) => g.fillStyle(0xffffff, 1).fillCircle(8, 8, 7));
  make(scene, "leafp", 18, 12, (g) => g.fillStyle(0x86c75e, 1).fillEllipse(9, 6, 16, 9));
  make(scene, "slash", 180, 180, (g) => {
    g.lineStyle(22, 0xffffff, 0.9).beginPath().arc(60, 90, 80, -1.1, 1.1, false).strokePath();
    g.lineStyle(10, 0xffffff, 1).beginPath().arc(70, 90, 80, -0.9, 0.9, false).strokePath();
  });
  make(scene, "fireball", 90, 64, (g) => {
    g.fillStyle(0xff8a3d, 0.45).fillEllipse(40, 32, 84, 56);
    g.fillStyle(0xff6a1a, 1).fillEllipse(52, 32, 52, 40);
    g.fillStyle(0xffd166, 1).fillEllipse(58, 32, 30, 24);
    g.lineStyle(4, OUT, 1).strokeEllipse(52, 32, 52, 40);
  });
  make(scene, "shield", 180, 180, (g) => {
    g.fillStyle(0xc6f3ff, 0.25).fillCircle(90, 90, 84);
    g.lineStyle(6, 0xe9fbff, 0.9).strokeCircle(90, 90, 84);
    g.lineStyle(3, 0x9fe3ff, 0.8).strokeCircle(90, 90, 70);
    g.fillStyle(0xffffff, 0.7).fillEllipse(60, 52, 40, 18);
  });
  make(scene, "wind", 160, 90, (g) => {
    g.lineStyle(8, 0xe8f4ff, 0.85);
    for (let i = 0; i < 3; i++) {
      g.beginPath().arc(60 + i * 30, 45, 26 - i * 4, Math.PI * 0.2, Math.PI * 1.7, false).strokePath();
    }
  });
  make(scene, "candy", 32, 32, (g) => {
    circle(g, 16, 16, 11, 0xff7eb6, 3);
    g.fillStyle(0xffffff, 1).fillCircle(12, 12, 3);
  });
  make(scene, "orb", 76, 76, (g) => {
    g.fillStyle(0xffe066, 0.35).fillCircle(38, 38, 36);
    circle(g, 38, 38, 26, 0xfff3c4, 4);
  });
  make(scene, "shadow", 100, 24, (g) => g.fillStyle(0x000000, 0.22).fillEllipse(50, 12, 96, 20));
  make(scene, "heart", 32, 30, (g) => {
    g.fillStyle(0xff5f7e, 1).fillCircle(10, 10, 9).fillCircle(22, 10, 9).fillTriangle(2, 13, 30, 13, 16, 28);
  });
  make(scene, "campfire", 140, 120, (g) => {
    stick(g, 20, 104, 120, 90, 10, 0x6b4226);
    stick(g, 20, 90, 120, 104, 10, 0x7a4a26);
    g.fillStyle(0xff8a3d, 1).fillTriangle(40, 92, 100, 92, 70, 10);
    g.fillStyle(0xffd166, 1).fillTriangle(54, 92, 88, 92, 70, 40);
  });
}
