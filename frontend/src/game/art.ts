/**
 * All art is drawn in code at boot (original, no external assets):
 * storybook style, chunky dark outlines, warm palette.
 * Characters face right; scenes flip them.
 */

import type Phaser from "phaser";
import { LW, OUT, arcStroke, circle, ellipse, hills, line, make, poly, pts, rrect, star, stick, type G } from "./art-kit";
import { buildWorldTextures } from "./art-worlds";

export { OUT };
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

/** Tiny shared details that keep the hand-drawn cast visually related. */
function glint(g: G, x: number, y: number, r = 2, color = 0xffffff) {
  g.fillStyle(color, 0.9).fillCircle(x, y, r);
  g.fillStyle(color, 0.45).fillCircle(x - r * 0.8, y - r * 0.8, r * 0.45);
}

function seam(g: G, x1: number, y1: number, x2: number, y2: number, steps: number, color = 0xf6e7c1) {
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.3) / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    g.fillStyle(color, 0.82).fillCircle(x, y, 1.25);
  }
}

// ------------------------------------------------------------------- hero
export type HeroPose = "idle" | "walk1" | "walk2" | "walk3" | "walk4" | "strum1" | "strum2" | "hurt";

/**
 * The traveling bard: crimson feathered cap, green tunic with gold trim,
 * flowing cape, and a lute with real strings. Faces right.
 */
function hero(g: G, pose: HeroPose) {
  const skin = 0xf6c9a0;
  const hair = 0x8a4b22;
  const tunic = 0x3f9a5a;
  const tunicShade = 0x2f7a46;
  const crimson = 0xb8323a;
  const step = pose === "walk1" ? 1 : pose === "walk3" ? -1 : 0;
  const bob = pose === "walk2" || pose === "walk4" ? -2 : 0;
  const hurt = pose === "hurt";

  // cape, flowing behind
  const sway = step * 3 + (pose === "walk2" ? -2 : pose === "walk4" ? 2 : 0);
  poly(g, pts(36, 60 + bob, 60, 58 + bob, 64, 108, 46 + sway, 124, 18 + sway, 116), 0xc0392b);
  g.fillStyle(0x8a2430, 1).fillPoints(pts(38, 64 + bob, 47, 64 + bob, 40 + sway, 116, 24 + sway, 113), true);

  // legs and boots
  const leg = (hipX: number, footX: number, color: number) => {
    stick(g, hipX, 100 + bob, footX, 129, 10, color);
    poly(g, pts(footX - 8, 127, footX + 6, 127, footX + 12, 133, footX + 11, 139, footX - 9, 139), 0x6b3a1c, 4);
  };
  if (step !== 0) {
    leg(46, 46 - 11 * step, 0x3b2e4a);
    leg(56, 56 + 11 * step, 0x4a3a5a);
  } else {
    leg(46, 44, 0x3b2e4a);
    leg(57, 60, 0x4a3a5a);
  }

  g.save();
  g.translateCanvas(0, bob);
  // the far arm reaches forward to hold the lute's neck
  stick(g, 46, 68, 84, 63, 8, tunicShade);
  // tunic
  poly(g, pts(35, 58, 69, 58, 74, 104, 30, 104), tunic);
  g.fillStyle(tunicShade, 1).fillPoints(pts(58, 59, 68, 59, 72.5, 102, 61, 102), true);
  g.fillStyle(PALETTE.gold, 1).fillRect(31, 98, 42, 4);
  poly(g, pts(45, 58, 59, 58, 52, 69), 0xf2c14e, 3); // gold collar
  rrect(g, 32, 87, 40, 7, 2, 0x5a3418, 3); // belt
  rrect(g, 47, 85.5, 10, 10, 2, PALETTE.gold, 3); // buckle
  // Embroidered hems, a shoulder clasp and cuffs make the bard read at a
  // glance even when the character is scaled down during play.
  seam(g, 35, 101, 69, 101, 6, 0xf7d36a);
  circle(g, 39, 66, 3.2, PALETTE.gold, 1.5);
  g.fillStyle(0xb7e4b5, 0.8).fillTriangle(39, 72, 43, 78, 35, 78);
  g.fillStyle(0xf2c14e, 1).fillRect(60, 70, 5, 12);
  line(g, 65, 72, 68, 78, 1.5, 0xffe7a1);

  // lute: neck, pegbox, pear-shaped body, rosette, strings
  stick(g, 62, 88, 99, 57, 6, 0x7a4a24);
  poly(g, pts(97, 53, 106, 47, 110, 52, 101, 59), 0x5a3418, 3);
  for (const [px, py] of [[101, 49], [105, 47], [104, 55], [108, 53]]) g.fillStyle(0xf6e7c1, 1).fillCircle(px, py, 1.8);
  ellipse(g, 67, 83, 22, 19, 0xd08a3a);
  ellipse(g, 57, 91, 33, 28, 0xd08a3a);
  g.fillStyle(0xd08a3a, 1).fillEllipse(62, 87, 22, 16);
  g.fillStyle(0xa86a28, 1).fillEllipse(54, 96, 20, 12);
  g.lineStyle(2, 0xf2c14e, 1).strokeCircle(61, 88, 6.5);
  g.fillStyle(OUT, 1).fillCircle(61, 88, 4.5);
  g.lineStyle(1.5, 0xf6e7c1, 0.82).beginPath().arc(61, 88, 3, 0.1, Math.PI * 1.8, false).strokePath();
  g.lineStyle(1.2, 0xfff6dc, 0.95);
  for (const d of [-1.6, 0, 1.6]) g.lineBetween(51 + d * 0.6, 96 + d, 99 + d * 0.6, 57 + d);
  rrect(g, 49, 94, 7, 4, 1, 0x5a3418, 2); // bridge

  // the strumming arm
  const hand = pose === "strum1" ? { x: 70, y: 79 } : pose === "strum2" ? { x: 62, y: 102 } : { x: 64, y: 95 };
  stick(g, 57, 66, hand.x - 2, hand.y - 3, 9, tunic);
  circle(g, hand.x, hand.y, 6, skin, 3);
  if (pose === "strum1" || pose === "strum2") {
    g.lineStyle(3, 0xfff6dc, 0.9);
    g.beginPath().arc(64, 90, 18, -1.1, 0.9, false).strokePath();
    g.beginPath().arc(64, 90, 24, -0.9, 0.7, false).strokePath();
  }

  // head
  circle(g, 48, 40, 21, hair);
  circle(g, 55, 42, 19, skin);
  ellipse(g, 45, 45, 8, 10, skin, 3); // ear
  g.fillStyle(hair, 1).fillPoints(pts(37, 36, 50, 25, 70, 29, 67, 35, 57, 31, 47, 37, 40, 41), true);
  if (hurt) {
    line(g, 59, 37, 67, 45, 3);
    line(g, 67, 37, 59, 45, 3);
    ellipse(g, 64, 52, 6, 7, 0x3a0d12, 2);
  } else {
    ellipse(g, 63, 41, 9, 11, 0xffffff, 2.5);
    g.fillStyle(0x3a2416, 1).fillCircle(64.6, 42, 3.4);
    g.fillStyle(0xffffff, 1).fillCircle(65.8, 40.5, 1.4);
    line(g, 58, 32.5, 67, 31.5, 3, hair);
    g.lineStyle(2.5, OUT, 1).beginPath().arc(64, 49, 4.5, 0.25, 2.3, false).strokePath();
  }
  g.fillStyle(0xf08a7a, 0.6).fillEllipse(64, 49.5, 8, 4.5);
  g.fillStyle(0xe8a87c, 1).fillCircle(71, 45, 2.4);
  glint(g, 57, 31, 1.4, 0xffe8b3);

  // floppy cap with a long golden feather
  poly(g, pts(36, 23, 14, 3, 19, 1, 44, 18), PALETTE.gold, 3);
  line(g, 18, 3, 40, 21, 1.6, 0xb8902c);
  ellipse(g, 56, 18, 52, 23, crimson);
  g.fillStyle(0x9c2832, 1).fillEllipse(66, 21, 26, 13);
  g.fillStyle(0xd8545c, 1).fillEllipse(46, 13, 16, 6);
  ellipse(g, 54, 26, 48, 9, 0x7d1f28, 3);
  seam(g, 37, 26, 68, 27, 5, 0xffc7b7);
  g.restore();
}

// ------------------------------------------------------------------- enemies
export interface WolfLook {
  dark: number;
  mid: number;
  body: number;
  light: number;
  snout: number;
  eye: number;
  /** Jackal: tall ears. */
  bigEars?: boolean;
  /** Robot: antenna, bolts, glowing tail light. */
  robot?: boolean;
}

export const WOLF_LOOKS: Record<"forest" | "jackal" | "robot", WolfLook> = {
  forest: { dark: 0x4d586a, mid: 0x5d6a7e, body: 0x6f7d92, light: 0x9aa6b8, snout: 0x7f8ca0, eye: 0xffd34d },
  jackal: { dark: 0x9a6a32, mid: 0xb07a3a, body: 0xc9934f, light: 0xead2a0, snout: 0xd6a866, eye: 0xffe066, bigEars: true },
  robot: { dark: 0x5c6675, mid: 0x77818f, body: 0x9aa5b3, light: 0xd2dae3, snout: 0xb3bdc9, eye: 0x4ef0ff, robot: true },
};

function wolf(g: G, open = false, look: WolfLook = WOLF_LOOKS.forest) {
  g.translateCanvas(0, 6); // room for tall ears
  poly(g, pts(12, 40, 30, 46, 34, 58, 8, 60, 2, 50), look.mid); // tail
  if (look.robot) circle(g, 6, 50, 5, 0xff4d5e, 3);
  stick(g, 34, 60, 30, 84, 9, look.dark);
  stick(g, 48, 62, 50, 84, 9, look.mid);
  stick(g, 80, 62, 82, 84, 9, look.dark);
  stick(g, 94, 60, 96, 84, 9, look.mid);
  ellipse(g, 62, 52, 84, 42, look.body);
  ellipse(g, 66, 62, 48, 14, look.light, 0);
  // The layered chest ruff and paws make the three wolf variants feel like a
  // designed family instead of palette swaps.
  poly(g, pts(51, 46, 60, 62, 68, 47, 76, 62, 84, 48, 89, 59, 80, 68, 60, 70, 45, 61), look.light, 0);
  for (const x of [30, 50, 82, 96]) {
    g.fillStyle(look.light, 0.55).fillEllipse(x, 83, 14, 5);
    line(g, x - 3, 82, x - 1, 86, 1.25, look.dark);
  }
  if (look.robot) {
    line(g, 40, 40, 84, 40, 3, look.dark);
    for (const x of [44, 62, 80]) g.fillStyle(OUT, 1).fillCircle(x, 50, 2.5);
  }
  if (look.bigEars) {
    poly(g, pts(88, 26, 94, -4, 106, 22), look.mid, 4);
    poly(g, pts(102, 24, 118, -2, 116, 28), look.mid, 4);
  } else {
    poly(g, pts(90, 24, 96, 4, 104, 22), look.mid, 4);
    poly(g, pts(102, 24, 114, 8, 114, 28), look.mid, 4);
  }
  circle(g, 102, 38, 20, look.body);
  poly(g, open ? pts(110, 30, 134, 32, 126, 40, 112, 44, 132, 50, 110, 52) : pts(110, 30, 134, 38, 112, 50), look.snout, 4);
  circle(g, 131, 37, 4, OUT, 0);
  circle(g, 104, 33, 5, look.eye, 3);
  g.fillStyle(OUT, 1).fillCircle(106, 33, 2.2);
  glint(g, 106.8, 31.6, 1);
  line(g, 97, 27, 109, 28, 3); // angry brow
  if (look.robot) {
    line(g, 96, 20, 92, 4, 3);
    circle(g, 92, 3, 3.5, 0xff4d5e, 2);
  }
}

function goblin(g: G) {
  stick(g, 34, 70, 30, 94, 8, 0x4f8a36);
  stick(g, 48, 70, 52, 94, 8, 0x4f8a36);
  rrect(g, 22, 50, 38, 32, 10, 0x6fae4c);
  poly(g, pts(22, 74, 60, 74, 56, 88, 26, 88), 0x7a5230, 4);
  g.fillStyle(0x4a7431, 1).fillTriangle(28, 58, 38, 50, 38, 74).fillTriangle(48, 50, 58, 58, 48, 74);
  rrect(g, 24, 72, 34, 6, 2, 0x5a3418, 2);
  circle(g, 41, 75, 3.5, PALETTE.gold, 1.5);
  poly(g, pts(14, 26, 30, 30, 26, 40), 0x6fae4c, 4); // ear
  poly(g, pts(70, 22, 56, 30, 60, 40), 0x6fae4c, 4);
  poly(g, pts(17, 29, 26, 32, 24, 36), 0xe2a97b, 0);
  poly(g, pts(67, 25, 59, 32, 61, 36), 0xe2a97b, 0);
  circle(g, 44, 36, 19, 0x7cc25a);
  poly(g, pts(31, 24, 40, 12, 45, 24, 50, 11, 57, 27), 0x486c2f, 3);
  circle(g, 52, 32, 5, 0xfff07a, 3);
  g.fillStyle(0xc0392b, 1).fillCircle(53, 32, 2.5);
  g.fillStyle(0xffffff, 1).fillCircle(54, 30.8, 1);
  g.fillStyle(0xffffff, 1).fillTriangle(47, 46, 50, 46, 48.5, 50).fillTriangle(52, 47, 55, 47, 53.5, 51);
  poly(g, pts(58, 36, 70, 42, 58, 44), 0x6fae4c, 3); // nose
  line(g, 44, 46, 56, 48, 3);
  stick(g, 60, 64, 82, 22, 7, 0x8a5a33); // club
  circle(g, 82, 20, 9, 0x8a5a33);
  for (const y of [17, 22]) line(g, 76, y, 87, y + 3, 1.5, 0x5a3418);
}

function troll(g: G, raised = false) {
  stick(g, 60, 150, 52, 186, 18, 0x5d6e44);
  stick(g, 108, 150, 116, 186, 18, 0x5d6e44);
  ellipse(g, 86, 112, 124, 104, 0x7c8f5c);
  g.fillStyle(0x5d6e44, 1).fillCircle(60, 96, 9).fillCircle(104, 130, 11).fillCircle(78, 140, 6);
  // Mossy stone plates break up the big silhouette and suggest great weight.
  for (const [x, y, r] of [[52, 118, 8], [76, 102, 6], [102, 112, 7], [116, 142, 6]] as const) {
    circle(g, x, y, r, 0x91a96b, 2);
    g.fillStyle(0xc0cf8b, 0.48).fillCircle(x - r * 0.22, y - r * 0.25, r * 0.35);
  }
  poly(g, pts(46, 130, 128, 130, 120, 160, 52, 160), 0x6b4a2a, 4);
  circle(g, 102, 52, 30, 0x8ea36a);
  g.fillStyle(0x748a54, 1).fillEllipse(95, 37, 34, 12);
  ellipse(g, 128, 60, 26, 18, 0x9cb276);
  circle(g, 108, 42, 5, 0xfff07a, 3);
  g.fillStyle(OUT, 1).fillCircle(110, 42, 2.5);
  g.fillStyle(0xffffff, 1).fillCircle(111, 40.8, 1);
  poly(g, pts(100, 72, 106, 62, 110, 72), 0xf6e7c1, 3); // tusk
  if (raised) {
    stick(g, 130, 100, 150, 20, 12, 0x6b4226);
    ellipse(g, 152, 16, 30, 26, 0x6b4226);
  } else {
    stick(g, 130, 110, 166, 150, 12, 0x6b4226);
    ellipse(g, 168, 154, 30, 26, 0x6b4226);
  }
  circle(g, 132, 106, 12, 0x8ea36a);
  for (const x of [125, 132, 139]) line(g, x, 108, x - 2, 114, 1.5, 0x5d6e44);
}

function witch(g: G) {
  stick(g, 4, 128, 96, 112, 5, 0x8a5a33); // broom
  poly(g, pts(0, 120, 14, 112, 18, 136, 2, 140), 0xd6a447, 4);
  poly(g, pts(32, 66, 66, 66, 84, 132, 14, 132), 0x5b3b8c);
  poly(g, pts(14, 120, 84, 120, 84, 132, 14, 132), 0x3e2766, 3);
  poly(g, pts(34, 66, 50, 70, 62, 66, 61, 105, 38, 105), 0x7c5fb1, 0);
  rrect(g, 26, 102, 46, 7, 2, 0xd94f8c, 2);
  circle(g, 50, 105, 4, PALETTE.gold, 1.5);
  circle(g, 50, 52, 16, 0x9fd27a);
  poly(g, pts(62, 50, 76, 58, 62, 60), 0x8cc266, 3);
  circle(g, 56, 48, 4, 0xffffff, 2);
  g.fillStyle(OUT, 1).fillCircle(57, 48, 2);
  g.fillStyle(0xffffff, 1).fillCircle(57.6, 47, 0.8);
  g.lineStyle(4, 0xdddddd, 1).lineBetween(36, 46, 30, 70).lineBetween(40, 48, 36, 74);
  ellipse(g, 50, 40, 60, 10, 0x2a1f3d, 4);
  poly(g, pts(30, 38, 70, 38, 60, 4, 54, 0), 0x2a1f3d);
  g.fillStyle(0xd94f8c, 1).fillRect(32, 30, 36, 5);
  g.fillStyle(0x6c416b, 1).fillTriangle(36, 42, 44, 50, 34, 55).fillTriangle(64, 42, 56, 50, 67, 55);
  circle(g, 80, 84, 9, 0xff7eb6, 3); // candy in hand
  glint(g, 77, 80, 2, 0xffffff);
}

export type BigWolfLook = "forest" | "sand" | "mecha";

const BIG_LOOKS: Record<BigWolfLook, { fur: number; light: number; pants: number; pants2: number; vest: number; eye: number }> = {
  forest: { fur: 0x4f5866, light: 0x9aa3b1, pants: 0x6b4a2a, pants2: 0x5a3c20, vest: 0x6b4a8c, eye: 0xff3b3b },
  sand: { fur: 0x86715a, light: 0xd9c49a, pants: 0x7a3a8a, pants2: 0x6a2f7a, vest: 0xb8342a, eye: 0xff9d2e },
  mecha: { fur: 0x7b8797, light: 0xc9d3de, pants: 0x4b5563, pants2: 0x3e4756, vest: 0x2f3746, eye: 0x4ef0ff },
};

function bigWolf(g: G, pose: "idle" | "huff" | "hurt", variant: BigWolfLook = "forest") {
  const L = BIG_LOOKS[variant];
  const fur = L.fur;
  const furLight = L.light;
  if (variant === "mecha") {
    // jet pack behind his back
    rrect(g, 52, 120, 30, 86, 10, 0x5c6675);
    rrect(g, 70, 112, 30, 92, 10, 0x77818f);
    poly(g, pts(56, 206, 78, 206, 67, 240), 0xffb35c, 3);
    poly(g, pts(74, 204, 96, 204, 85, 236), 0x7ff3ff, 3);
  }
  // bushy tail, attached at his back
  poly(g, pts(86, 196, 54, 170, 16, 164, 4, 182, 20, 208, 58, 224, 84, 226), fur);
  g.fillStyle(furLight, 1).fillPoints(pts(16, 166, 6, 182, 16, 196, 30, 178), true);
  // legs + trousers
  stick(g, 104, 240, 96, 300, 24, L.pants);
  stick(g, 160, 240, 170, 300, 24, L.pants2);
  poly(g, pts(84, 296, 116, 296, 120, 314, 74, 314), fur, 4);
  poly(g, pts(156, 296, 190, 296, 196, 314, 152, 314), fur, 4);
  poly(g, pts(84, 230, 186, 230, 180, 262, 90, 262), L.pants, 4);
  // torso + vest
  ellipse(g, 134, 182, 130, 140, fur);
  ellipse(g, 144, 186, 70, 96, furLight, 0);
  // Broad fur chevrons and clothing seams give the boss a much richer read at
  // full scale, while staying clear of the hurt/huff silhouette changes.
  for (const [y, width] of [[160, 42], [182, 52], [204, 44]] as const) {
    g.lineStyle(3, fur, 0.55).beginPath().moveTo(144 - width / 2, y - 8).lineTo(144, y).lineTo(144 + width / 2, y - 8).strokePath();
  }
  poly(g, pts(82, 130, 112, 120, 112, 236, 86, 230), L.vest, 4);
  poly(g, pts(184, 130, 160, 120, 162, 236, 186, 228), L.vest, 4);
  seam(g, 101, 135, 100, 226, 7, 0xe6c47a);
  seam(g, 171, 134, 173, 224, 7, 0xe6c47a);
  if (variant === "mecha") {
    rrect(g, 116, 150, 52, 52, 12, 0x3e4756, 4);
    circle(g, 142, 176, 14, 0x4ef0ff, 4);
    glint(g, 137, 171, 4);
  } else {
    g.fillStyle(0xf2c14e, 1).fillCircle(170, 160, 4).fillCircle(170, 190, 4);
  }
  if (variant === "sand") {
    line(g, 84, 136, 110, 128, 3, 0xf2c14e);
    line(g, 162, 128, 184, 136, 3, 0xf2c14e);
    g.fillStyle(0xf2c14e, 1).fillRect(88, 226, 96, 8); // sash
    arcStroke(g, 92, 262, 30, 2.0, 3.3, 6, 0xdfe6ee); // scimitar at his belt
  }
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
  poly(g, pts(124, 30, 128, 50, 120, 50), variant === "mecha" ? 0x4ef0ff : 0xd98c8c, 0);
  circle(g, 146, 86, 46, fur);
  // Tufted cheeks keep his three world variants recognisably the same wolf.
  poly(g, pts(116, 90, 102, 106, 120, 106, 110, 120, 130, 114), fur, 0);
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
  if (variant === "mecha") rrect(g, 138, 62, 46, 22, 8, 0x1b2230, 4); // visor
  circle(g, 160, 74, 9, pose === "hurt" ? 0xffffff : L.eye, 3);
  g.fillStyle(OUT, 1).fillCircle(163, 74, 3.5);
  glint(g, 164.5, 71.5, 1.6);
  if (variant !== "mecha") line(g, 146, 60, 172, 64, 5); // brow
  if (variant === "sand") {
    // turban with a jewel, ears poking out
    ellipse(g, 144, 52, 76, 30, 0xf2ece0);
    ellipse(g, 140, 42, 54, 20, 0xe4ddcc, 3);
    circle(g, 150, 50, 7, 0x3fb6a8, 3);
    poly(g, pts(150, 44, 156, 24, 162, 44), 0xc0392b, 3); // feather
  }
  if (variant === "mecha") {
    line(g, 118, 24, 112, 6, 3);
    circle(g, 112, 5, 4, 0xff4d5e, 2);
    for (const [x, y] of [[124, 112], [168, 108], [104, 160]]) g.fillStyle(OUT, 1).fillCircle(x, y, 3);
    for (const [x, y] of [[58, 142], [76, 190], [190, 142], [176, 194]]) circle(g, x, y, 3, 0x4ef0ff, 1.5);
  }
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

export function buildTextures(scene: Phaser.Scene) {
  for (const pose of ["idle", "walk1", "walk2", "walk3", "walk4", "strum1", "strum2", "hurt"] as const) {
    make(scene, pose === "idle" ? "hero" : `hero_${pose}`, 116, 140, (g) => hero(g, pose), { paper: true });
  }
  const paper = { paper: true };
  make(scene, "wolf", 140, 98, (g) => wolf(g), paper);
  make(scene, "wolf_bite", 140, 98, (g) => wolf(g, true), paper);
  make(scene, "jackal", 140, 98, (g) => wolf(g, false, WOLF_LOOKS.jackal), paper);
  make(scene, "jackal_bite", 140, 98, (g) => wolf(g, true, WOLF_LOOKS.jackal), paper);
  make(scene, "robopup", 140, 98, (g) => wolf(g, false, WOLF_LOOKS.robot), paper);
  make(scene, "robopup_bite", 140, 98, (g) => wolf(g, true, WOLF_LOOKS.robot), paper);
  make(scene, "goblin", 96, 100, goblin, paper);
  make(scene, "troll", 190, 192, (g) => troll(g), paper);
  make(scene, "troll_raise", 190, 192, (g) => troll(g, true), paper);
  make(scene, "witch", 100, 144, witch, paper);
  for (const [key, look] of [["bigwolf", "forest"], ["sandwolf", "sand"], ["mechawolf", "mecha"]] as const) {
    make(scene, key, 260, 320, (g) => bigWolf(g, "idle", look), paper);
    make(scene, `${key}_huff`, 260, 320, (g) => bigWolf(g, "huff", look), paper);
    make(scene, `${key}_hurt`, 260, 320, (g) => bigWolf(g, "hurt", look), paper);
  }

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
  make(scene, "fairy", 90, 110, (g) => {
    // wings
    g.fillStyle(0xd9f6ff, 0.85).fillEllipse(24, 40, 36, 52).fillEllipse(66, 40, 36, 52);
    g.lineStyle(3, OUT, 0.6).strokeEllipse(24, 40, 36, 52).strokeEllipse(66, 40, 36, 52);
    g.lineStyle(1.5, 0x9fd6ef, 0.8).lineBetween(24, 20, 38, 61).lineBetween(66, 20, 52, 61);
    // dress + head
    poly(g, pts(45, 44, 64, 92, 26, 92), 0xff9fd0, 4);
    poly(g, pts(45, 47, 54, 86, 45, 90), 0xffc9e3, 0);
    g.fillStyle(0xf6e7c1, 1).fillRect(38, 48, 14, 4);
    circle(g, 45, 34, 13, 0xf2c49b, 4);
    g.fillStyle(0xd9d9d9, 1).fillEllipse(45, 24, 28, 12);
    g.fillStyle(OUT, 1).fillCircle(49, 33, 2);
    glint(g, 50, 31.8, 0.8);
    // wand with a star
    stick(g, 60, 62, 80, 30, 3, 0xf6e7c1);
    star(g, 80, 26, 10, 0xffe066);
    glint(g, 78, 23, 1.5);
  }, paper);
  buildWorldTextures(scene);
  make(scene, "campfire", 140, 120, (g) => {
    stick(g, 20, 104, 120, 90, 10, 0x6b4226);
    stick(g, 20, 90, 120, 104, 10, 0x7a4a26);
    g.fillStyle(0xff8a3d, 1).fillTriangle(40, 92, 100, 92, 70, 10);
    g.fillStyle(0xffd166, 1).fillTriangle(54, 92, 88, 92, 70, 40);
  });
}
