/**
 * How each world looks: sky, parallax layers, ground, scenery, the boss
 * arena, and a static backdrop for menus.
 */

import Phaser from "phaser";
import type { WorldId } from "../levels";
import { GROUND_Y, text } from "../fx";

interface Layer {
  key: string;
  y: number;
  /** Parallax factor (0 = fixed sky, 1 = moves with the ground). */
  f: number;
}

interface Prop {
  key: string;
  /** Relative chance. */
  weight: number;
  scale: [number, number];
  /** Sink into the ground a little. */
  dy: number;
}

interface Theme {
  sky: [number, number];
  nightSky: [number, number];
  sun: number;
  layers: Layer[];
  /** Different art at night (lit windows); otherwise the day layers tinted. */
  nightLayers?: Layer[];
  ground: string;
  /** Tint for scenery at night. */
  nightTint: number;
  clouds: boolean;
  props: Prop[];
  /** Big blurry things passing in front. */
  front: { key: string; tint: number; scale: number };
}

export const THEMES: Record<WorldId, Theme> = {
  forest: {
    sky: [0xf9d9a6, 0xbfe0e0],
    nightSky: [0x1d2140, 0x4a3f6b],
    sun: 0xfff1c4,
    layers: [
      { key: "hills_far", y: 160, f: 0.08 },
      { key: "hills_mid", y: 210, f: 0.15 },
      { key: "forest_far", y: 200, f: 0.3 },
      { key: "forest_mid", y: 220, f: 0.5 },
    ],
    ground: "ground",
    nightTint: 0x6d6aa0,
    clouds: true,
    props: [
      { key: "tree", weight: 0.55, scale: [0.75, 1.25], dy: 6 },
      { key: "pine", weight: 0.45, scale: [0.75, 1.25], dy: 6 },
    ],
    front: { key: "bush", tint: 0x9cc890, scale: 1.4 },
  },
  desert: {
    sky: [0xffe2a8, 0xf6b973],
    nightSky: [0x3a2a5e, 0xe08a5c],
    sun: 0xfff3c4,
    layers: [
      { key: "dunes_far", y: 170, f: 0.08 },
      { key: "pyramids", y: 150, f: 0.15 },
      { key: "dunes_mid", y: 230, f: 0.3 },
      { key: "dunes_near", y: 280, f: 0.5 },
    ],
    ground: "ground_sand",
    nightTint: 0xe6a39a,
    clouds: false,
    props: [
      { key: "palm", weight: 0.45, scale: [0.8, 1.15], dy: 8 },
      { key: "rock", weight: 0.35, scale: [0.7, 1.2], dy: 6 },
      { key: "urn", weight: 0.2, scale: [0.8, 1.1], dy: 4 },
    ],
    front: { key: "rock", tint: 0xc9a070, scale: 1.6 },
  },
  future: {
    sky: [0x9fd8e8, 0xf2c6a0],
    nightSky: [0x0d1030, 0x3a1f5c],
    sun: 0xfff1c4,
    layers: [
      { key: "city_far", y: 120, f: 0.08 },
      { key: "city_mid", y: 170, f: 0.2 },
      { key: "city_near", y: 230, f: 0.45 },
    ],
    nightLayers: [
      { key: "city_far_n", y: 120, f: 0.08 },
      { key: "city_mid_n", y: 170, f: 0.2 },
      { key: "city_near_n", y: 230, f: 0.45 },
    ],
    ground: "ground_metal",
    nightTint: 0x9a9ae0,
    clouds: true,
    props: [
      { key: "lamp", weight: 0.45, scale: [0.85, 1.1], dy: 4 },
      { key: "holo_sign", weight: 0.25, scale: [0.8, 1], dy: 4 },
      { key: "crate", weight: 0.3, scale: [0.8, 1.2], dy: 4 },
    ],
    front: { key: "crate", tint: 0x7a8aa0, scale: 1.5 },
  },
};

function sky(scene: Phaser.Scene, world: WorldId, night: boolean, fixed: boolean) {
  const t = THEMES[world];
  const [top, bottom] = night ? t.nightSky : t.sky;
  const g = scene.add.graphics().setDepth(-100);
  if (fixed) g.setScrollFactor(0);
  g.fillGradientStyle(top, top, bottom, bottom, 1).fillRect(0, 0, 1280, 720);
  const orb = night ? (world === "desert" ? 0xffe0b0 : 0xfff6d6) : t.sun;
  scene.add.circle(night ? 1040 : 980, night ? 130 : 150, night ? 56 : 70, orb).setScrollFactor(0.02).setDepth(-99);
  if (night) {
    const n = world === "desert" ? 16 : 40;
    for (let i = 0; i < n; i++) scene.add.circle((i * 331) % 1280, (i * 97) % 320, 2, 0xffffff, 0.8).setScrollFactor(0).setDepth(-99);
  }
}

/** Parallax backdrop for a walking level. Layers are camera-fixed tile sprites; update them with `scroll`. */
export function scrollingBackdrop(scene: Phaser.Scene, world: WorldId, night: boolean) {
  const t = THEMES[world];
  sky(scene, world, night, true);
  const clouds: Phaser.GameObjects.Image[] = [];
  if (t.clouds) {
    for (let i = 0; i < 6; i++) {
      const c = scene.add.image(200 + i * 260, 80 + (i % 3) * 50, "cloud").setScrollFactor(0).setDepth(-98).setAlpha(night ? 0.35 : 0.9).setScale(0.7 + (i % 2) * 0.3);
      if (night) c.setTint(0x8a86c0);
      clouds.push(c);
    }
  }
  const layers: { ts: Phaser.GameObjects.TileSprite; f: number }[] = [];
  const list = night && t.nightLayers ? t.nightLayers : t.layers;
  list.forEach((l, i) => {
    const ts = scene.add.tileSprite(0, l.y, 1280, scene.textures.getFrame(l.key).height, l.key).setOrigin(0, 0).setScrollFactor(0).setDepth(-90 + i * 5);
    if (night && !t.nightLayers) ts.setTint(t.nightTint);
    layers.push({ ts, f: l.f });
  });
  const ground = scene.add.tileSprite(0, GROUND_Y - 8, 1280, 150, t.ground).setOrigin(0, 0).setScrollFactor(0).setDepth(1);
  if (night) ground.setTint(t.nightTint);
  return {
    layers,
    ground,
    clouds,
    /** Call every frame. */
    scroll(cam: Phaser.Cameras.Scene2D.Camera, dt: number) {
      for (const l of layers) l.ts.tilePositionX = cam.scrollX * l.f;
      ground.tilePositionX = cam.scrollX;
      for (const c of clouds) {
        c.x -= dt * 0.012;
        if (c.x < -150) c.x += 1600;
      }
    },
  };
}

/** Scenery along the path, kept clear of the set pieces. */
export function scatterProps(scene: Phaser.Scene, world: WorldId, night: boolean, width: number, keepClear: number[]) {
  const t = THEMES[world];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const total = t.props.reduce((s, p) => s + p.weight, 0);
  const tint = night ? t.nightTint : 0xffffff;
  for (let x = 80; x < width; x += 180 + rnd() * 260) {
    if (keepClear.some((c) => Math.abs(x - c) < 420)) continue;
    let r = rnd() * total;
    const prop = t.props.find((p) => (r -= p.weight) <= 0) ?? t.props[0];
    const s = prop.scale[0] + rnd() * (prop.scale[1] - prop.scale[0]);
    scene.add.image(x, GROUND_Y + prop.dy, prop.key).setOrigin(0.5, 1).setScale(s).setDepth(2).setTint(night ? tint : rnd() < 0.4 ? 0xe8e0d0 : 0xffffff);
    if (world === "forest") {
      if (rnd() < 0.5) scene.add.image(x + 70, GROUND_Y + 10, "mushroom").setOrigin(0.5, 1).setScale(0.6 + rnd() * 0.5).setDepth(3).setTint(tint);
      if (rnd() < 0.6) scene.add.image(x - 90, GROUND_Y + 14, "bush").setOrigin(0.5, 1).setScale(0.6 + rnd() * 0.4).setDepth(3).setTint(tint);
    } else if (world === "desert" && rnd() < 0.4) {
      scene.add.image(x + 80, GROUND_Y + 6, "rock").setOrigin(0.5, 1).setScale(0.4 + rnd() * 0.3).setDepth(3).setTint(tint);
    }
  }
  for (let x = 300; x < width + 600; x += 700 + rnd() * 400) {
    scene.add.image(x, 760, t.front.key).setOrigin(0.5, 1).setScale(t.front.scale).setScrollFactor(1.2).setDepth(40).setTint(t.front.tint);
  }
}

/** The signpost at the end of a level. */
export function endSign(scene: Phaser.Scene, x: number, label: string, world: WorldId) {
  const wood = world === "future" ? 0x4b5563 : 0x6b4226;
  const board = world === "future" ? 0x241a3a : 0xc89055;
  const ink = world === "future" ? "#7ff3ff" : "#2b1a12";
  const g = scene.add.graphics().setDepth(3);
  g.fillStyle(wood, 1).fillRect(x - 8, GROUND_Y - 150, 16, 150);
  g.fillStyle(board, 1).fillRoundedRect(x - 120, GROUND_Y - 170, 240, 56, 8);
  g.lineStyle(5, 0x2b1a12, 1).strokeRoundedRect(x - 120, GROUND_Y - 170, 240, 56, 8);
  text(scene, x, GROUND_Y - 142, label, 22, ink, world === "future" ? "#241a3a" : "#c89055").setDepth(4);
}

/** The boss arena (one screen, no scrolling). */
export function bossArena(scene: Phaser.Scene, world: WorldId) {
  if (world === "forest") {
    const g = scene.add.graphics().setDepth(-100);
    g.fillGradientStyle(0xf6b98a, 0xf6b98a, 0xb9d6e0, 0xb9d6e0, 1).fillRect(0, 0, 1280, 720);
    scene.add.circle(1050, 140, 80, 0xffe9b0).setDepth(-99);
    scene.add.image(640, 160, "hills_far").setOrigin(0.5, 0).setDepth(-90);
    scene.add.image(640, 230, "hills_mid").setOrigin(0.5, 0).setDepth(-85);
    scene.add.image(640, 230, "forest_far").setOrigin(0.5, 0).setDepth(-80).setAlpha(0.8);
    scene.add.image(170, GROUND_Y + 6, "house_straw").setOrigin(0.5, 1).setDepth(1).setScale(0.85);
    scene.add.image(560, GROUND_Y + 6, "house_sticks").setOrigin(0.5, 1).setDepth(1).setScale(0.8);
    scene.add.image(1130, GROUND_Y + 6, "house_bricks").setOrigin(0.5, 1).setDepth(1).setScale(0.9);
    scene.add.image(380, GROUND_Y + 8, "tree").setOrigin(0.5, 1).setDepth(0).setScale(0.8);
    scene.add.image(860, GROUND_Y + 8, "pine").setOrigin(0.5, 1).setDepth(0).setScale(0.9);
    scene.add.tileSprite(0, GROUND_Y - 8, 1280, 150, "ground").setOrigin(0, 0).setDepth(1);
    for (const x of [90, 470, 760, 1220]) scene.add.image(x, GROUND_Y + 12, "bush").setOrigin(0.5, 1).setScale(0.6).setDepth(3);
  } else if (world === "desert") {
    const g = scene.add.graphics().setDepth(-100);
    g.fillGradientStyle(0x4a3270, 0x4a3270, 0xf2a066, 0xf2a066, 1).fillRect(0, 0, 1280, 720);
    scene.add.circle(1040, 170, 76, 0xffd59a).setDepth(-99);
    scene.add.image(640, 170, "dunes_far").setOrigin(0.5, 0).setDepth(-90);
    scene.add.image(640, 150, "pyramids").setOrigin(0.5, 0).setDepth(-85);
    scene.add.image(640, 260, "dunes_mid").setOrigin(0.5, 0).setDepth(-80);
    scene.add.image(560, GROUND_Y + 10, "oasis").setOrigin(0.5, 1).setDepth(0).setScale(1.1, 0.8);
    for (const [x, s] of [[150, 1.05], [360, 0.85], [800, 0.9], [1180, 1.1]] as const) scene.add.image(x, GROUND_Y + 8, "palm").setOrigin(0.5, 1).setScale(s).setDepth(1);
    scene.add.tileSprite(0, GROUND_Y - 8, 1280, 150, "ground_sand").setOrigin(0, 0).setDepth(1);
    for (const x of [60, 470, 960, 1240]) scene.add.image(x, GROUND_Y + 8, "rock").setOrigin(0.5, 1).setScale(0.5).setDepth(3);
    scene.add.image(700, GROUND_Y + 6, "urn").setOrigin(0.5, 1).setScale(0.8).setDepth(3);
  } else {
    const g = scene.add.graphics().setDepth(-100);
    g.fillGradientStyle(0x0d1030, 0x0d1030, 0x3a1f5c, 0x3a1f5c, 1).fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 40; i++) scene.add.circle((i * 331) % 1280, (i * 97) % 300, 2, 0xffffff, 0.8).setDepth(-99);
    scene.add.circle(1060, 130, 54, 0xfff6d6).setDepth(-99);
    scene.add.image(640, 120, "city_far_n").setOrigin(0.5, 0).setDepth(-90);
    scene.add.image(640, 170, "city_mid_n").setOrigin(0.5, 0).setDepth(-85);
    scene.add.image(180, GROUND_Y + 6, "pod_a").setOrigin(0.5, 1).setDepth(1).setScale(0.85);
    scene.add.image(560, GROUND_Y + 6, "pod_b").setOrigin(0.5, 1).setDepth(1).setScale(0.8);
    scene.add.image(1130, GROUND_Y + 6, "pod_c").setOrigin(0.5, 1).setDepth(1).setScale(0.9);
    for (const x of [380, 860]) scene.add.image(x, GROUND_Y + 4, "lamp").setOrigin(0.5, 1).setDepth(0).setScale(0.9);
    scene.add.tileSprite(0, GROUND_Y - 8, 1280, 150, "ground_metal").setOrigin(0, 0).setDepth(1);
    for (const x of [90, 720, 1240]) scene.add.image(x, GROUND_Y + 4, "crate").setOrigin(0.5, 1).setScale(0.6).setDepth(3);
  }
}

/** A still backdrop for menus (title, tuner, end screens). */
export function staticBackdrop(scene: Phaser.Scene, world: WorldId, night = false) {
  const t = THEMES[world];
  sky(scene, world, night, false);
  const list = night && t.nightLayers ? t.nightLayers : t.layers;
  list.forEach((l, i) => {
    const img = scene.add.image(640, l.y, l.key).setOrigin(0.5, 0).setDepth(-90 + i * 5);
    if (night && !t.nightLayers) img.setTint(t.nightTint);
  });
  const tint = night ? t.nightTint : 0xffffff;
  scene.add.tileSprite(0, GROUND_Y - 8, 1280, 150, t.ground).setOrigin(0, 0).setDepth(1).setTint(tint);
  const spots: [number, number][] = [[120, 1.1], [380, 0.9], [1150, 1], [930, 0.8]];
  spots.forEach(([x, s], i) => {
    const p = t.props[i % t.props.length];
    scene.add.image(x, GROUND_Y + p.dy, p.key).setOrigin(0.5, 1).setScale(s).setDepth(2).setTint(tint);
  });
  if (world === "forest") {
    scene.add.image(250, GROUND_Y + 10, "mushroom").setOrigin(0.5, 1).setDepth(3).setTint(tint);
    scene.add.image(1020, GROUND_Y + 14, "bush").setOrigin(0.5, 1).setDepth(3).setTint(tint);
  }
}
