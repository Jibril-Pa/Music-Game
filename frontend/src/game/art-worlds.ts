/**
 * Art for the later worlds, drawn in code like the forest (original, no
 * external assets): the Moonlit Wood's giant and beanstalk, the Shifting
 * Sands (One Thousand and One Nights, the Sphinx) and the Clockwork City of
 * Year 3000 (Andersen's tin soldier and mechanical nightingale, robots).
 * Characters face right; scenes flip them.
 */

import type Phaser from "phaser";
import { LW, OUT, arcStroke, circle, ellipse, hills, line, make, poly, pts, rrect, star, stick, type G } from "./art-kit";

const STEEL = 0x9aa5b3;
const STEEL_DARK = 0x5c6675;
const STEEL_MID = 0x77818f;
const NEON_CYAN = 0x7ff3ff;
const NEON_PINK = 0xff5fd2;
const LASER = 0xff4d5e;
const GOLD = 0xeac54e;

function glint(g: G, x: number, y: number, r = 2, color = 0xffffff) {
  g.fillStyle(color, 0.92).fillCircle(x, y, r);
  g.fillStyle(color, 0.4).fillCircle(x - r * 0.7, y - r * 0.7, r * 0.5);
}

function studs(g: G, points: readonly (readonly [number, number])[], color = GOLD) {
  for (const [x, y] of points) {
    circle(g, x, y, 3.2, color, 1.4);
    g.fillStyle(0xffffff, 0.55).fillCircle(x - 0.9, y - 1, 0.8);
  }
}

// ------------------------------------------------------------------- Moonlit Wood
function giant(g: G, raised = false) {
  const skin = 0xe2ab7c;
  const hair = 0x8a4b22;
  stick(g, 84, 196, 78, 244, 26, 0x5a4a32);
  stick(g, 140, 196, 148, 244, 26, 0x4a3c28);
  rrect(g, 54, 236, 46, 22, 9, 0x3a2a1a);
  rrect(g, 128, 236, 46, 22, 9, 0x3a2a1a);
  stick(g, 70, 118, 46, 184, 22, skin); // back arm
  poly(g, pts(62, 98, 162, 98, 178, 212, 46, 212), 0x5f7a3a); // tunic
  poly(g, pts(62, 98, 162, 98, 150, 120, 74, 120), 0x4c6430, 4);
  // Patchwork makes the giant feel lived-in at boss scale.
  poly(g, pts(78, 128, 112, 122, 108, 154, 76, 160), 0x6f9146, 0);
  poly(g, pts(116, 122, 150, 126, 158, 158, 120, 154), 0x496837, 0);
  for (const [x, y] of [[82, 143], [94, 139], [130, 139], [144, 145]] as const) g.fillStyle(0xc8d98f, 0.72).fillCircle(x, y, 1.7);
  g.fillStyle(0x5a3418, 1).fillRect(52, 158, 120, 14);
  g.lineStyle(4, OUT, 1).strokeRect(52, 158, 120, 14);
  circle(g, 112, 165, 8, 0xf2c14e, 3);
  rrect(g, 70, 180, 22, 18, 4, 0x7a8f4a, 3); // patch
  circle(g, 112, 62, 40, skin);
  poly(g, pts(78, 66, 146, 66, 140, 112, 112, 128, 84, 112), hair); // beard
  for (const x of [90, 102, 122, 134]) g.lineStyle(2, 0xbd7a4c, 0.8).lineBetween(x, 71, x + (x < 112 ? 5 : -5), 105);
  poly(g, pts(72, 56, 80, 28, 112, 16, 144, 28, 152, 56, 136, 42, 112, 36, 88, 42), hair);
  ellipse(g, 112, 70, 18, 13, 0xd08f60, 3);
  circle(g, 98, 54, 6, 0xffffff, 3);
  circle(g, 126, 54, 6, 0xffffff, 3);
  g.fillStyle(OUT, 1).fillCircle(101, 55, 3).fillCircle(129, 55, 3);
  line(g, 88, 44, 106, 49, 5);
  line(g, 118, 49, 136, 44, 5);
  line(g, 102, 92, 122, 90, 4);
  glint(g, 99, 53, 1.3);
  if (raised) {
    stick(g, 160, 112, 184, 46, 24, skin);
    stick(g, 184, 50, 206, 14, 16, 0x7a4a26);
    ellipse(g, 208, 18, 34, 26, 0x7a4a26);
  } else {
    stick(g, 158, 114, 180, 178, 24, skin);
    stick(g, 182, 172, 212, 230, 16, 0x7a4a26);
    ellipse(g, 214, 236, 32, 26, 0x7a4a26);
  }
}

function beanstalk(g: G) {
  for (const [phase, color, w] of [[0, 0x3d7d2c, 26], [Math.PI, 0x56a63e, 20]] as const) {
    const path = (lw: number, c: number) => {
      g.lineStyle(lw, c, 1).beginPath();
      for (let y = 720; y >= 0; y -= 16) {
        const x = 90 + Math.sin(y / 80 + phase) * 32;
        if (y === 720) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    };
    path(w + LW * 2, OUT);
    path(w, color);
  }
  for (let y = 660, i = 0; y > 30; y -= 64, i++) {
    const side = i % 2 ? 1 : -1;
    const x = 90 + Math.sin(y / 80) * 32 + side * 36;
    ellipse(g, x, y, 56, 26, 0x6cc04a, 4);
    line(g, x - side * 22, y, x + side * 20, y - 2, 3, 0x3d7d2c);
  }
}

// ------------------------------------------------------------------- Shifting Sands
function scorpion(g: G, strike = false) {
  const shell = 0xc98a3e;
  const dark = 0x9a6229;
  for (let i = 0; i < 4; i++) stick(g, 46 + i * 13, 66, 36 + i * 15, 86, 4, dark);
  const tail = strike
    ? [[34, 60], [22, 48], [20, 33], [32, 20], [50, 16]]
    : [[34, 60], [20, 50], [14, 35], [20, 21], [34, 14]];
  for (const [x, y] of tail) circle(g, x, y, 9, shell, 4);
  const [tx, ty] = tail[tail.length - 1];
  poly(g, strike ? pts(tx + 6, ty - 6, tx + 22, ty, tx + 8, ty + 8) : pts(tx + 4, ty - 8, tx + 16, ty - 2, tx + 6, ty + 6), 0x3a2a1a, 3);
  g.fillStyle(0xffe066, 0.85).fillCircle(tx + 6, ty - 1, 3);
  ellipse(g, 66, 64, 72, 30, shell);
  // Faceted plates keep the small enemy legible against the sand.
  for (const [x, y, w] of [[48, 61, 10], [62, 58, 12], [77, 60, 10]] as const) {
    g.fillStyle(0xe6b35d, 0.62).fillTriangle(x - w / 2, y, x, y - 8, x + w / 2, y);
  }
  for (let x = 46; x < 96; x += 14) line(g, x, 52, x, 76, 3, dark);
  ellipse(g, 100, 62, 30, 24, shell);
  stick(g, 108, 60, 120, 48, 6, shell);
  ellipse(g, 124, 42, 20, 13, shell, 4);
  ellipse(g, 127, 50, 14, 8, dark, 3);
  stick(g, 104, 68, 118, 76, 6, shell);
  ellipse(g, 124, 78, 18, 11, shell, 4);
  g.fillStyle(OUT, 1).fillCircle(106, 56, 3).fillCircle(112, 58, 2.5);
  glint(g, 106.8, 55, 1);
  glint(g, 112.6, 57.2, 0.8);
}

function thief(g: G, swing = false) {
  const skin = 0xc68c5a;
  ellipse(g, 40, 102, 30, 38, 0x7a4a9a);
  ellipse(g, 64, 102, 30, 38, 0x6a3a8a);
  poly(g, pts(24, 118, 50, 118, 52, 128, 22, 128, 18, 122), 0x3a2a1a, 4);
  poly(g, pts(54, 118, 80, 118, 86, 122, 82, 128, 52, 128), 0x3a2a1a, 4);
  rrect(g, 30, 52, 44, 46, 12, 0xeee2c4);
  poly(g, pts(30, 54, 46, 54, 44, 96, 30, 96), 0x2f2f4a, 4);
  poly(g, pts(74, 54, 60, 54, 62, 96, 74, 96), 0x2f2f4a, 4);
  g.fillStyle(0xc0392b, 1).fillRect(30, 84, 44, 10);
  g.lineStyle(3, OUT, 1).strokeRect(30, 84, 44, 10);
  for (const x of [38, 48, 58, 68]) g.fillStyle(0xf2c14e, 0.85).fillCircle(x, 89, 1.8);
  circle(g, 56, 36, 16, skin);
  circle(g, 62.5, 34.5, 3.8, 0xffffff, 2);
  g.fillStyle(OUT, 1).fillCircle(63.5, 35, 2);
  g.fillStyle(0xffffff, 1).fillCircle(64.2, 33.8, 0.8);
  line(g, 58, 29.5, 67, 30, 2.5, 0x2a1a10);
  poly(g, pts(56, 44, 70, 42, 66, 48), 0x2a1a10, 0);
  ellipse(g, 54, 24, 42, 22, 0xf2efe6);
  ellipse(g, 54, 18, 30, 14, 0xe4ddcc, 3);
  circle(g, 56, 14, 6, 0xc0392b, 3);
  // A scarf tail provides a readable motion cue in both sword poses.
  poly(g, pts(38, 24, 18, 34, 28, 42, 43, 31), 0xc0392b, 3);
  glint(g, 64.2, 33.8, 0.8);
  if (swing) {
    stick(g, 68, 64, 88, 44, 7, skin);
    arcStroke(g, 70, 64, 36, -2.3, -0.4, 6, 0xdfe6ee);
  } else {
    stick(g, 68, 64, 84, 78, 7, skin);
    arcStroke(g, 84, 50, 30, 0.2, 1.55, 6, 0xdfe6ee);
  }
}

function mummy(g: G) {
  const wrap = 0xe9dfc4;
  const seam = 0xb9ab88;
  stick(g, 42, 110, 40, 138, 12, wrap);
  stick(g, 60, 110, 64, 138, 12, wrap);
  rrect(g, 26, 54, 50, 62, 14, wrap);
  for (let y = 62; y < 114; y += 9) line(g, 28, y, 74, y + 4, 2.5, seam);
  for (const [x, y] of [[36, 70], [61, 80], [44, 99]] as const) g.fillStyle(0xfaf2d8, 0.75).fillRect(x, y, 12, 2);
  stick(g, 54, 74, 92, 82, 11, wrap);
  stick(g, 60, 62, 98, 66, 11, wrap);
  for (const x of [72, 82, 92]) line(g, x, 60, x - 2, 70, 2, seam);
  circle(g, 52, 34, 20, wrap);
  line(g, 34, 26, 70, 22, 2.5, seam);
  line(g, 33, 44, 71, 40, 2.5, seam);
  rrect(g, 44, 28, 28, 11, 4, 0x2a1f14, 3);
  g.fillStyle(0x9cff6e, 1).fillCircle(53, 33, 3).fillCircle(65, 33, 3);
  glint(g, 52.3, 32.2, 0.8, 0xeaffd4);
  glint(g, 64.3, 32.2, 0.8, 0xeaffd4);
  // A faded charm distinguishes this from a plain wrapped zombie.
  g.lineStyle(2, 0xc9a35e, 0.75).beginPath().moveTo(50, 68).lineTo(58, 76).lineTo(50, 84).lineTo(42, 76).closePath().strokePath();
  poly(g, pts(26, 96, 14, 120, 22, 122, 30, 100), wrap, 3);
}

function djinn(g: G) {
  g.translateCanvas(0, 4);
  const skin = 0xe06a3c;
  circle(g, 56, 152, 7, 0xf7c98a, 3);
  circle(g, 48, 138, 11, 0xf3a95e, 4);
  circle(g, 54, 120, 16, 0xf3a95e);
  circle(g, 62, 106, 18, 0xf3a95e, 0);
  poly(g, pts(30, 56, 94, 56, 76, 112, 46, 112), skin);
  poly(g, pts(36, 58, 52, 58, 50, 104, 42, 100), 0x6a2a8a, 3);
  poly(g, pts(88, 58, 72, 58, 72, 104, 80, 100), 0x6a2a8a, 3);
  g.fillStyle(0xf2c14e, 1).fillRect(46, 100, 32, 8);
  g.lineStyle(3, OUT, 1).strokeRect(46, 100, 32, 8);
  studs(g, [[50, 104], [62, 104], [74, 104]]);
  stick(g, 32, 64, 16, 100, 12, skin);
  rrect(g, 8, 88, 18, 12, 4, 0xf2c14e, 3);
  stick(g, 90, 64, 110, 34, 12, skin);
  rrect(g, 100, 40, 18, 12, 4, 0xf2c14e, 3);
  circle(g, 112, 24, 9, 0xffd166, 3);
  circle(g, 62, 36, 19, skin);
  poly(g, pts(44, 30, 34, 18, 48, 24), skin, 3);
  poly(g, pts(80, 30, 90, 18, 76, 24), skin, 3);
  poly(g, pts(54, 18, 62, 0, 70, 18), 0x2a1a10, 3);
  g.fillStyle(0xffe066, 1).fillCircle(56, 34, 4).fillCircle(70, 34, 4);
  g.fillStyle(OUT, 1).fillCircle(57, 34, 2).fillCircle(71, 34, 2);
  line(g, 50, 26, 60, 29, 3);
  line(g, 66, 29, 76, 26, 3);
  poly(g, pts(58, 50, 66, 50, 62, 62), 0x2a1a10, 0);
  circle(g, 42, 42, 4, 0xf2c14e, 2);
  g.lineStyle(3, 0xffbd68, 0.8).beginPath().arc(57, 129, 27, 0.2, 2.9, false).strokePath();
  glint(g, 55.5, 33, 1.1, 0xfff0a6);
}

function caveDoor(g: G) {
  rrect(g, 12, 10, 136, 172, 50, 0x9a8a72);
  rrect(g, 26, 24, 108, 146, 40, 0xa89a80, 0);
  g.lineStyle(3, 0x6e604c, 1).beginPath().moveTo(40, 60).lineTo(56, 80).lineTo(48, 100).strokePath();
  g.beginPath().moveTo(118, 130).lineTo(104, 140).lineTo(110, 160).strokePath();
  circle(g, 80, 80, 26, GOLD, 4);
  circle(g, 90, 74, 22, 0xa89a80, 0);
  star(g, 100, 98, 11, GOLD);
  g.lineStyle(7, OUT, 1).strokeCircle(80, 140, 12);
  g.lineStyle(3, 0xc9a35e, 1).strokeCircle(80, 140, 12);
}

function cave(g: G) {
  poly(g, pts(0, 350, 24, 230, 70, 150, 150, 80, 250, 56, 340, 92, 410, 170, 450, 250, 480, 350), 0xb48c5a);
  g.fillStyle(0x9a7448, 1).fillPoints(pts(250, 62, 336, 96, 404, 172, 444, 252, 470, 346, 360, 346, 330, 200), true);
  for (const [x, y, r] of [[80, 250, 14], [130, 160, 10], [380, 210, 12], [300, 120, 9], [420, 300, 16]]) circle(g, x, y, r, 0x9a7448, 3);
  rrect(g, 160, 154, 160, 200, 74, 0x3a2716);
  line(g, 0, 348, 480, 348, 4);
}

function sphinx(g: G) {
  const body = 0xdcb86c;
  const blue = 0x2f5fa8;
  rrect(g, 6, 196, 318, 36, 6, 0xc9a35e);
  line(g, 6, 214, 324, 214, 3, 0xa8874a);
  poly(g, pts(20, 150, 6, 130, 14, 120, 30, 142), body, 4);
  ellipse(g, 70, 150, 110, 90, body);
  ellipse(g, 150, 160, 220, 76, body);
  rrect(g, 196, 168, 124, 30, 14, body);
  // Sun-carved muscles and jewelry make the stationary riddle guardian feel
  // like a character, not just a piece of scenery.
  g.lineStyle(3, 0xbf9858, 0.7).beginPath().arc(126, 158, 36, 2.8, 5.6, false).strokePath();
  g.lineStyle(3, 0xbf9858, 0.7).beginPath().arc(176, 166, 38, 3.1, 5.8, false).strokePath();
  line(g, 300, 172, 300, 196, 3);
  line(g, 286, 172, 286, 196, 3);
  ellipse(g, 238, 118, 86, 104, body);
  poly(g, pts(196, 44, 280, 44, 300, 140, 262, 116, 214, 116, 176, 140), blue);
  for (let i = 0; i < 6; i++) {
    line(g, 200 - i * 3, 58 + i * 14, 186 - i * 2, 68 + i * 14, 4, GOLD);
    line(g, 276 + i * 3, 58 + i * 14, 290 + i * 2, 68 + i * 14, 4, GOLD);
  }
  rrect(g, 214, 50, 48, 64, 18, body);
  rrect(g, 206, 40, 64, 16, 6, GOLD);
  g.fillStyle(OUT, 1).fillCircle(228, 76, 4).fillCircle(250, 76, 4);
  line(g, 220, 70, 236, 72, 3);
  line(g, 242, 72, 258, 70, 3);
  line(g, 239, 80, 236, 94, 3);
  line(g, 230, 102, 248, 102, 3);
  rrect(g, 230, 112, 18, 26, 6, blue, 3);
  for (let y = 117; y < 136; y += 6) line(g, 232, y, 246, y, 2, GOLD);
  circle(g, 239, 120, 4, 0xd94f6a, 1.5);
  glint(g, 237.5, 118.5, 1);
}

function palm(g: G) {
  // a gently curved trunk of overlapping scales
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const x = 90 + Math.sin(t * 1.4) * 34;
    const y = 296 - t * 222;
    ellipse(g, x, y, 30 - t * 8, 22, i % 2 ? 0xa8743c : 0x96652f, 3);
  }
  const top = { x: 124, y: 72 };
  for (const [dx, dy] of [[-92, 24], [-64, -30], [-6, -54], [62, -34], [92, 22], [44, 52], [-46, 50]]) {
    const len = Math.hypot(dx, dy);
    const px = (-dy / len) * 14;
    const py = (dx / len) * 14;
    const mx = top.x + dx * 0.5;
    const my = top.y + dy * 0.5;
    poly(g, pts(top.x, top.y, mx + px, my + py, top.x + dx, top.y + dy, mx - px * 0.4, my - py * 0.4), 0x4e9a3a, 4);
  }
  circle(g, 118, 84, 9, 0x6b4226, 3);
  circle(g, 132, 86, 9, 0x6b4226, 3);
}

function rock(g: G) {
  poly(g, pts(6, 78, 14, 40, 40, 14, 80, 8, 110, 26, 126, 60, 124, 78), 0xb08a5c);
  g.fillStyle(0x8e6c44, 1).fillPoints(pts(82, 14, 106, 30, 120, 60, 120, 74, 94, 74, 96, 42), true);
  line(g, 4, 77, 126, 77, 4);
}

function urn(g: G) {
  ellipse(g, 35, 56, 56, 56, 0xc7643a);
  rrect(g, 22, 10, 26, 22, 6, 0xc7643a);
  ellipse(g, 35, 10, 34, 10, 0xa84f2c, 4);
  g.lineStyle(4, 0xf2c14e, 1).lineBetween(10, 52, 60, 52);
  g.fillStyle(OUT, 1);
  for (let x = 14; x < 56; x += 10) g.fillTriangle(x, 58, x + 5, 66, x + 10, 58);
  ellipse(g, 35, 84, 34, 8, 0xa84f2c, 3);
}

function oasis(g: G) {
  ellipse(g, 210, 64, 400, 90, 0x4fb3d1);
  g.fillStyle(0x9fdcf0, 1);
  for (let i = 0; i < 6; i++) g.fillRoundedRect(60 + i * 55, 50 + (i % 2) * 18, 34, 6, 3);
  for (const x of [22, 36, 378, 394]) stick(g, x, 78, x + (x < 200 ? -6 : 6), 26, 4, 0x5f9a3a);
}

/** Far pyramids on the horizon (tiles every 1280 px). */
function pyramids(g: G, w: number, h: number, color: number, shade: number) {
  for (const [cx, top, half] of [[170, 236, 150], [430, 176, 220], [560, 256, 110], [890, 214, 180], [1150, 246, 120]]) {
    g.fillStyle(color, 1).fillTriangle(cx - half, h, cx + half, h, cx, top);
    g.fillStyle(shade, 1).fillTriangle(cx, top, cx + half, h, cx + half * 0.2, h);
  }
  void w;
}

function groundSand(g: G, w: number, h: number) {
  g.fillStyle(0xe2b06a, 1).fillRect(0, 0, w, h);
  g.fillStyle(0xd09a55, 1);
  for (let x = 10; x < w; x += 48) g.fillEllipse(x, 64 + ((x * 7) % 40), 30, 6);
  g.lineStyle(3, 0xc98f4a, 1);
  for (let y = 34; y < h; y += 26) {
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const yy = y + Math.sin((x / w) * Math.PI * 4 + y) * 4;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.strokePath();
  }
  g.fillStyle(0xf0c886, 1).fillRect(0, 0, w, 12);
  g.lineStyle(LW, OUT, 1).lineBetween(0, 1, w, 1);
}

// ------------------------------------------------------------------- Clockwork City
function drone(g: G) {
  stick(g, 20, 34, 84, 34, 6, STEEL_DARK);
  ellipse(g, 20, 26, 36, 8, 0xd2dae3, 3);
  ellipse(g, 84, 26, 36, 8, 0xd2dae3, 3);
  line(g, 20, 29, 20, 34, 4);
  line(g, 84, 29, 84, 34, 4);
  ellipse(g, 52, 50, 60, 44, STEEL);
  ellipse(g, 52, 62, 40, 14, STEEL_MID, 0);
  circle(g, 62, 48, 12, 0x1b2230, 4);
  circle(g, 64, 47, 7, LASER, 0);
  glint(g, 61, 44, 2.5);
  // Engine vents and status lamps make the drone clearly mechanical even at
  // its small in-game scale.
  for (const x of [39, 47, 55]) line(g, x, 61, x + 3, 68, 1.5, STEEL_DARK);
  studs(g, [[28, 48], [78, 48]], NEON_CYAN);
  line(g, 40, 30, 36, 14, 3);
  circle(g, 36, 12, 4, LASER, 3);
  stick(g, 40, 70, 34, 80, 3, STEEL_DARK);
  stick(g, 64, 70, 70, 80, 3, STEEL_DARK);
}

function tinSoldier(g: G) {
  g.translateCanvas(0, 4);
  const red = 0xc8342e;
  const blue = 0x2f4f9a;
  // The steadfast tin soldier stands on his one leg.
  stick(g, 46, 112, 46, 142, 12, blue);
  rrect(g, 34, 138, 26, 10, 3, 0x1b1b24);
  rrect(g, 28, 62, 38, 56, 8, red);
  line(g, 30, 64, 64, 110, 5, 0xf2efe6);
  line(g, 64, 64, 30, 110, 5, 0xf2efe6);
  circle(g, 47, 87, 5, 0xf2c14e, 3);
  studs(g, [[36, 74], [58, 74], [36, 106], [58, 106]], 0xd2dae3);
  rrect(g, 26, 110, 42, 10, 3, blue, 3);
  circle(g, 48, 48, 14, 0xf0c8a0);
  g.fillStyle(0xe8897a, 0.8).fillCircle(54, 52, 3);
  g.fillStyle(OUT, 1).fillCircle(53, 46, 2.2);
  line(g, 48, 56, 57, 56, 3);
  rrect(g, 34, 10, 30, 32, 6, 0x1b1b24);
  rrect(g, 32, 38, 34, 6, 2, 0x1b1b24, 3);
  circle(g, 49, 26, 5, 0xf2c14e, 3);
  ellipse(g, 49, 6, 10, 14, red, 3);
  glint(g, 53, 45, 0.8);
  stick(g, 66, 72, 76, 22, 5, 0x6b4226);
  stick(g, 76, 24, 78, 8, 3, 0xd2dae3);
  stick(g, 64, 74, 70, 94, 8, red);
}

function mech(g: G, raised = false) {
  stick(g, 74, 150, 66, 194, 26, STEEL_DARK);
  stick(g, 134, 150, 142, 194, 26, STEEL_DARK);
  rrect(g, 40, 186, 52, 16, 6, 0x3e4756);
  rrect(g, 118, 186, 52, 16, 6, 0x3e4756);
  stick(g, 56, 84, 30, 148, 22, STEEL_DARK);
  circle(g, 28, 154, 16, STEEL);
  rrect(g, 46, 60, 116, 100, 18, STEEL);
  rrect(g, 60, 74, 88, 50, 10, 0xc2ccd8, 4);
  circle(g, 104, 99, 14, 0x4ef0ff, 4);
  glint(g, 99, 94, 4);
  g.lineStyle(2.5, STEEL_DARK, 0.78).lineBetween(68, 88, 88, 88).lineBetween(120, 112, 140, 112);
  g.fillStyle(OUT, 1);
  for (const [x, y] of [[54, 68], [154, 68], [54, 150], [154, 150]]) g.fillCircle(x, y, 3);
  rrect(g, 80, 26, 56, 40, 10, STEEL);
  rrect(g, 90, 36, 42, 14, 6, 0x1b2230, 3);
  g.fillStyle(LASER, 1).fillRect(108, 40, 20, 6);
  line(g, 96, 26, 92, 10, 3);
  circle(g, 92, 8, 4, LASER, 3);
  studs(g, [[70, 138], [138, 138]], NEON_CYAN);
  if (raised) {
    stick(g, 152, 80, 182, 30, 24, STEEL_DARK);
    rrect(g, 166, 6, 36, 30, 8, STEEL);
  } else {
    stick(g, 152, 84, 176, 146, 24, STEEL_DARK);
    rrect(g, 160, 142, 36, 30, 8, STEEL);
  }
}

function turret(g: G) {
  poly(g, pts(40, 100, 52, 100, 46, 124), NEON_CYAN, 3);
  poly(g, pts(70, 100, 82, 100, 76, 124), NEON_CYAN, 3);
  circle(g, 60, 66, 40, STEEL);
  ellipse(g, 60, 66, 84, 18, STEEL_MID, 4);
  rrect(g, 76, 54, 40, 18, 6, STEEL_DARK);
  rrect(g, 104, 50, 14, 26, 4, 0x3e4756, 4);
  circle(g, 54, 54, 10, 0x1b2230, 4);
  circle(g, 56, 53, 5, LASER, 0);
  glint(g, 54, 51, 1.5);
  for (const y of [66, 76, 86]) line(g, 34, y, 47, y + 3, 1.5, STEEL_DARK);
  line(g, 40, 28, 34, 10, 3);
  circle(g, 34, 8, 4, NEON_CYAN, 3);
}

function laserGate(g: G) {
  for (const x of [22, 148]) {
    rrect(g, x - 16, 30, 32, 276, 8, 0x4b5563);
    rrect(g, x - 9, 42, 18, 252, 6, 0x6b7584, 0);
    circle(g, x, 22, 14, STEEL);
    g.fillStyle(LASER, 1).fillCircle(x, 22, 6);
  }
  for (const y of [80, 140, 200, 260]) {
    g.fillStyle(LASER, 0.35).fillRect(38, y - 9, 94, 18);
    g.fillStyle(0xff8a95, 1).fillRect(38, y - 3, 94, 6);
    g.fillStyle(0xffffff, 0.9).fillRect(38, y - 1, 94, 2);
  }
}

function nightingale(g: G) {
  const dark = 0xb08a2a;
  for (const [y, c] of [[64, 0x3fa7d6], [88, 0xd94f6a], [112, 0x3fa7d6]] as const) poly(g, pts(72, 98, 8, y - 10, 12, y + 12), c, 4);
  stick(g, 120, 56, 120, 30, 6, dark); // wind-up key
  ellipse(g, 106, 22, 26, 18, GOLD, 4);
  ellipse(g, 134, 22, 26, 18, GOLD, 4);
  ellipse(g, 128, 104, 130, 88, GOLD);
  poly(g, pts(84, 86, 150, 72, 136, 124, 92, 120), dark);
  // Feather seams keep the mechanical bird ornate, rather than a flat gold
  // blob, and match the storybook ink treatment used in the other worlds.
  for (const x of [96, 110, 124, 138]) line(g, x, 86, x - 6, 126, 2, 0xd9a43a);
  for (const [x, y, c] of [[104, 94, 0x3fa7d6], [124, 88, 0xd94f6a], [116, 108, 0x5fd38a]] as const) circle(g, x, y, 6, c, 3);
  circle(g, 164, 116, 18, dark, 4); // gear on the chest
  g.fillStyle(dark, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.fillCircle(164 + Math.cos(a) * 20, 116 + Math.sin(a) * 20, 4.5);
  }
  circle(g, 164, 116, 7, 0xd94f6a, 3);
  circle(g, 196, 70, 30, GOLD);
  poly(g, pts(222, 64, 248, 72, 222, 82), 0xf2efe6, 4);
  circle(g, 204, 64, 8, 0xffffff, 3);
  g.fillStyle(0x3fa7d6, 1).fillCircle(206, 64, 4);
  glint(g, 207, 62.5, 1.2);
  stick(g, 120, 146, 112, 176, 5, dark);
  stick(g, 140, 146, 148, 176, 5, dark);
}

/** City skyline silhouette with lit windows (tiles every `w` px). */
function skyline(g: G, w: number, h: number, color: number, win: number, seed: number, minH: number, maxH: number) {
  let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  let x = 0;
  while (x < w) {
    const bw = Math.min(60 + rnd() * 90, w - x);
    const bh = minH + rnd() * (maxH - minH);
    const by = h - bh;
    g.fillStyle(color, 1).fillRect(x, by, bw, bh);
    if (rnd() < 0.35) g.fillRect(x + bw / 2 - 3, by - 40, 6, 40);
    g.fillStyle(win, 1);
    for (let wy = by + 14; wy < h - 10; wy += 22) {
      for (let wx = x + 10; wx < x + bw - 12; wx += 18) if (rnd() < 0.5) g.fillRect(wx, wy, 8, 10);
    }
    x += bw + 6;
  }
}

function lamp(g: G) {
  rrect(g, 28, 60, 14, 246, 4, 0x4b5563);
  rrect(g, 20, 296, 30, 12, 4, 0x3e4756);
  g.fillStyle(NEON_CYAN, 0.25).fillCircle(46, 40, 30);
  rrect(g, 30, 30, 34, 16, 8, NEON_CYAN, 4);
  line(g, 35, 60, 40, 46, 5);
}

function holoSign(g: G) {
  rrect(g, 84, 120, 12, 108, 3, 0x4b5563);
  rrect(g, 10, 10, 160, 112, 12, 0x241a3a);
  g.lineStyle(4, NEON_PINK, 1).strokeRoundedRect(18, 18, 144, 96, 10);
  g.fillStyle(NEON_CYAN, 1).fillEllipse(72, 86, 26, 18).fillRect(80, 36, 6, 50);
  g.fillTriangle(86, 36, 110, 48, 86, 56);
  g.fillStyle(NEON_PINK, 1).fillEllipse(112, 80, 18, 12).fillRect(117, 50, 4, 30);
}

function crate(g: G) {
  rrect(g, 4, 6, 76, 60, 6, 0x6b7584);
  line(g, 10, 12, 74, 60, 4, 0x4b5563);
  line(g, 74, 12, 10, 60, 4, 0x4b5563);
  g.fillStyle(0xf2c14e, 1).fillRect(8, 30, 68, 10);
  g.fillStyle(OUT, 1);
  for (let x = 12; x < 72; x += 14) g.fillTriangle(x, 40, x + 7, 30, x + 10, 40);
  g.lineStyle(4, OUT, 1).strokeRoundedRect(4, 6, 76, 60, 6);
}

function groundMetal(g: G, w: number, h: number) {
  g.fillStyle(0x4b5563, 1).fillRect(0, 0, w, h);
  g.fillStyle(0x3e4756, 1);
  for (let x = 0; x < w; x += 64) g.fillRect(x, 24, 3, h);
  for (let y = 60; y < h; y += 40) g.fillRect(0, y, w, 3);
  g.fillStyle(STEEL, 1);
  for (let x = 12; x < w; x += 32) g.fillCircle(x, 38, 2.5);
  g.fillStyle(0x6b7584, 1).fillRect(0, 8, w, 16);
  g.fillStyle(NEON_CYAN, 1).fillRect(0, 0, w, 8);
  g.lineStyle(LW, OUT, 1).lineBetween(0, 1, w, 1);
}

function podHouse(g: G, color: number) {
  rrect(g, 30, 100, 190, 130, 16, color);
  ellipse(g, 125, 104, 200, 120, color);
  rrect(g, 104, 160, 44, 70, 18, 0x3e4756);
  circle(g, 70, 140, 18, NEON_CYAN, 4);
  circle(g, 180, 140, 18, NEON_CYAN, 4);
  line(g, 125, 44, 125, 16, 4);
  circle(g, 125, 14, 6, LASER, 3);
}

// ------------------------------------------------------------------- time travel
function portal(g: G) {
  for (const [w, h, c] of [[240, 320, 0x6a3fb5], [196, 270, 0x3fa7d6], [150, 214, 0xb784ff], [100, 150, NEON_CYAN], [52, 86, 0xfff3c4]] as const) {
    g.fillStyle(c, 0.88).fillEllipse(130, 170, w, h);
  }
  g.lineStyle(6, OUT, 0.9).strokeEllipse(130, 170, 240, 320);
  for (let i = 0; i < 10; i++) star(g, 130 + Math.cos(i * 0.63) * (88 + (i % 3) * 12), 170 + Math.sin(i * 0.63) * (124 + (i % 2) * 10), 6, 0xffffff);
}

function hourglass(g: G) {
  rrect(g, 6, 4, 68, 12, 4, 0x8a5a33);
  rrect(g, 6, 94, 68, 12, 4, 0x8a5a33);
  stick(g, 12, 16, 12, 94, 4, 0x6b4226);
  stick(g, 68, 16, 68, 94, 4, 0x6b4226);
  poly(g, pts(18, 18, 62, 18, 42, 55, 38, 55), 0xd9f6ff, 3);
  poly(g, pts(38, 55, 42, 55, 62, 92, 18, 92), 0xd9f6ff, 3);
  g.fillStyle(0xf2c14e, 1).fillTriangle(28, 34, 52, 34, 40, 52).fillTriangle(22, 90, 58, 90, 40, 70);
  g.fillRect(39, 52, 2, 30);
}

// ------------------------------------------------------------------- projectiles
function riddle(g: G) {
  circle(g, 20, 20, 16, GOLD, 3);
  g.lineStyle(4, 0x2f5fa8, 1).beginPath().arc(20, 15, 6, Math.PI, Math.PI * 2.4, false).strokePath();
  g.lineBetween(22, 21, 20, 25);
  g.fillStyle(0x2f5fa8, 1).fillCircle(20, 31, 2.5);
}

function laserBolt(g: G) {
  g.fillStyle(LASER, 0.4).fillRoundedRect(0, 2, 48, 16, 8);
  g.fillStyle(0xff8a95, 1).fillRoundedRect(4, 6, 40, 8, 4);
  g.fillStyle(0xffffff, 1).fillRoundedRect(8, 8, 32, 4, 2);
}

function songNote(g: G) {
  ellipse(g, 14, 34, 20, 14, NEON_CYAN, 3);
  stick(g, 22, 34, 22, 8, 3, NEON_CYAN);
  poly(g, pts(22, 4, 34, 12, 22, 18), NEON_CYAN, 3);
}

export function buildWorldTextures(scene: Phaser.Scene) {
  // Moonlit Wood
  make(scene, "giant", 236, 262, (g) => giant(g), { paper: true });
  make(scene, "giant_raise", 236, 262, (g) => giant(g, true), { paper: true });
  make(scene, "beanstalk", 180, 720, beanstalk);

  // Shifting Sands
  make(scene, "scorpion", 140, 92, (g) => scorpion(g), { paper: true });
  make(scene, "scorpion_strike", 140, 92, (g) => scorpion(g, true), { paper: true });
  make(scene, "thief", 120, 132, (g) => thief(g), { paper: true });
  make(scene, "thief_swing", 120, 132, (g) => thief(g, true), { paper: true });
  make(scene, "mummy", 104, 144, mummy, { paper: true });
  make(scene, "djinn", 124, 168, djinn, { paper: true });
  make(scene, "cave_door", 160, 184, caveDoor, { paper: true });
  make(scene, "cave", 480, 352, cave);
  make(scene, "sphinx", 330, 236, sphinx, { paper: true });
  make(scene, "palm", 220, 310, palm);
  make(scene, "rock", 130, 80, rock);
  make(scene, "urn", 70, 92, urn);
  make(scene, "oasis", 420, 120, oasis);
  make(scene, "ground_sand", 256, 140, (g) => groundSand(g, 256, 140));
  make(scene, "dunes_far", 1280, 360, (g) => hills(g, 1280, 360, 0xf0cf94, 40, 220, 2));
  make(scene, "dunes_mid", 1280, 360, (g) => hills(g, 1280, 360, 0xe6b46f, 50, 220, 3));
  make(scene, "dunes_near", 1280, 360, (g) => hills(g, 1280, 360, 0xd99e57, 40, 230, 2));
  make(scene, "pyramids", 1280, 420, (g) => pyramids(g, 1280, 420, 0xe9c78a, 0xd2a868));

  // Clockwork City
  make(scene, "drone", 104, 84, drone, { paper: true });
  make(scene, "tinsoldier", 92, 156, tinSoldier, { paper: true });
  make(scene, "mech", 210, 206, (g) => mech(g), { paper: true });
  make(scene, "mech_raise", 210, 206, (g) => mech(g, true), { paper: true });
  make(scene, "turret", 124, 130, turret, { paper: true });
  make(scene, "laser_gate", 170, 310, laserGate, { paper: true });
  make(scene, "nightingale", 252, 184, nightingale, { paper: true });
  make(scene, "lamp", 70, 310, lamp);
  make(scene, "holo_sign", 180, 230, holoSign);
  make(scene, "crate", 84, 70, crate);
  make(scene, "ground_metal", 256, 140, (g) => groundMetal(g, 256, 140));
  make(scene, "city_far", 1280, 420, (g) => skyline(g, 1280, 420, 0xb9c6d6, 0xe6eef6, 11, 120, 260));
  make(scene, "city_mid", 1280, 420, (g) => skyline(g, 1280, 420, 0x8d9db2, 0xd6e2ee, 23, 140, 300));
  make(scene, "city_near", 1280, 420, (g) => skyline(g, 1280, 420, 0x6b7a90, 0xffe9a8, 37, 160, 330));
  make(scene, "city_far_n", 1280, 420, (g) => skyline(g, 1280, 420, 0x2a2350, 0x7ff3ff, 11, 120, 260));
  make(scene, "city_mid_n", 1280, 420, (g) => skyline(g, 1280, 420, 0x1f1a40, 0xff5fd2, 23, 140, 300));
  make(scene, "city_near_n", 1280, 420, (g) => skyline(g, 1280, 420, 0x15122e, 0xffe066, 37, 160, 330));
  for (const [key, color] of [["pod_a", 0xc9d3de], ["pod_b", 0x9ac0d8], ["pod_c", 0xd8b0c8]] as const) make(scene, key, 250, 236, (g) => podHouse(g, color));

  // time travel + projectiles
  make(scene, "portal", 260, 340, portal);
  make(scene, "hourglass", 80, 110, hourglass);
  make(scene, "riddle", 40, 40, riddle);
  make(scene, "laser", 48, 20, laserBolt);
  make(scene, "note", 40, 44, songNote);
}
