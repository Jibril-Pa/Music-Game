/**
 * The three worlds in 3D (low-poly, cel-shaded, ink-outlined): the
 * Enchanted Forest (day / moonlit night), the Shifting Sands (day / dusk)
 * and the Clockwork City (day / neon night), each as a walking level, a boss
 * arena or a menu backdrop. Set pieces stand where the level puts them.
 */

import * as THREE from "three";
import { UNIT, type StageWorld } from "./Stage3D";
import * as K from "./kit";
import { WorldBuilder, type Look, type WorldSpec } from "./scaffold";

const u = (px: number) => px / UNIT;
const shared = { vc: () => K.toon(0xffffff, { vertexColors: true }) };

function clearings(spec: WorldSpec, r: number) {
  const out: { x: number; r: number }[] = [];
  // Boss arenas: keep the set (the pigs' houses, the oasis, the pods) in view.
  if (spec.kind === "arena") out.push({ x: 1.8, r: 2.4 }, { x: 5.7, r: 2.6 }, { x: 11.2, r: 2.6 });
  for (const px of Object.values(spec.landmarks ?? {})) if (px !== undefined) out.push({ x: u(px), r });
  if (spec.kind === "journey" && spec.length) out.push({ x: u(spec.length), r: 2.5 });
  if (spec.portalX !== undefined) out.push({ x: u(spec.portalX), r: 2 });
  return out;
}

/** Instanced variants: pick a variant per spot, one draw call per variant. */
function variants(b: WorldBuilder, geos: THREE.BufferGeometry[], capacity: number, opts: { outline?: number; cast?: boolean; mat?: THREE.Material } = {}) {
  const mat = opts.mat ?? shared.vc();
  const sc = geos.map((g) => new K.Scatter(b.root, g, mat, capacity, { outline: opts.outline ?? 0.04, cast: opts.cast }));
  return {
    add(i: number, x: number, y: number, z: number, scale: number, rot: number, tint?: number, sy?: number) {
      sc[i % sc.length].add(x, y, z, scale, rot, tint, sy);
    },
    done() {
      sc.forEach((s) => s.done());
    },
  };
}

const grey = (k: number) => new THREE.Color(k, k, k).getHex();

// ================================================================== FOREST
function forest(spec: WorldSpec): StageWorld {
  const night = spec.night;
  const look: Look = night
    ? {
        sky: { zenith: 0x0b0e2a, horizon: 0x3b3a72, ground: 0x2c2c5a, sun: 0xdfe6ff, sunDir: [0.36, 0.16, -1], glow: 0.7 },
        fog: [0x34356a, 12, 90],
        hemi: [0x8090d8, 0x1a2a20, 1.7],
        sun: [0xb8c4ff, 1.5],
        sunFrom: [10, 16, 10],
        ground: { a: 0x3a6a4c, b: 0x2f5a40, far: 0x2c2c5a, path: 0x76687a, edge: 0x4e4458 },
        actorTint: 0xbcc2ea,
      }
    : {
        sky: { zenith: 0x6fb2e6, horizon: 0xfbe3b2, ground: 0xd8e6c0, sun: 0xfff0c0, sunDir: [-0.32, 0.15, -1], glow: 1 },
        fog: [0xe9ead2, 14, 105],
        hemi: [0xe2f2ff, 0x6a8a40, 1.4],
        sun: [0xfff2d6, 2.2],
        sunFrom: [-12, 20, 14],
        ground: { a: 0x86c95e, b: 0x6cb54c, far: 0xd0dcb0, path: 0xd19a5e, edge: 0xa06c3c },
        actorTint: 0xffffff,
      };
  const b = new WorldBuilder(spec, look);
  b.ground({ seed: 11 });
  if (night) b.starsAndMoon(0xfff6d6, look.sky.sunDir);
  else b.sunDisc(0xfff1c4, look.sky.sunDir);
  b.clouds(night ? 7 : 16, night ? 0x4c4e86 : 0xffffff, night ? 0.9 : 1);
  const clear = clearings(spec, 4.2);
  const haze = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(look.fog[0]), k).getHex();

  // Far mountains and rolling hills, softened by the fog.
  const r = K.rng(21);
  const mtnMat = new THREE.MeshToonMaterial({ vertexColors: true, fog: false });
  const mtn = variants(b, [K.mountain(1, haze(night ? 0x3c4270 : 0x8ea6bc, 0.35), haze(night ? 0x9aa6d8 : 0xffffff, 0.2)), K.mountain(2, haze(night ? 0x343a66 : 0x7f98b0, 0.45), haze(night ? 0x8a96c8 : 0xf4f8ff, 0.3))], 40, { outline: 0, cast: false, mat: mtnMat });
  for (let x = b.x0 - 120; x < b.x1 + 120; x += 22 + r() * 18) mtn.add(Math.floor(r() * 2), x, -0.5, -150 - r() * 90, 22 + r() * 18, r() * 3, undefined, 16 + r() * 16);
  mtn.done();

  const hillGeo = K.merge([K.paint(new THREE.IcosahedronGeometry(1, 2), 0xffffff)]);
  const hills = new K.Scatter(b.root, hillGeo, K.toon(0xffffff, { vertexColors: true }), 60, { outline: 0.0, cast: false });
  for (let x = b.x0 - 60; x < b.x1 + 60; x += 9 + r() * 8) {
    const z = -30 - r() * 34;
    hills.add(x, -3 - r(), z, 13 + r() * 8, r() * 3, night ? (r() < 0.5 ? 0x2c5a40 : 0x27503a) : r() < 0.5 ? 0x93d06c : 0x7dc15c, 7 + r() * 3);
  }
  hills.done();

  // The forest belt behind the path.
  const leaf = night ? 0x3d7550 : 0x5fa548;
  const leaf2 = night ? 0x2f6a48 : 0x3a7d48;
  const trees = variants(b, [K.roundTree(1, leaf), K.roundTree(2, leaf), K.roundTree(3, night ? 0x4a8058 : 0x6fb050)], 260, { outline: 0.05 });
  const pines = variants(b, [K.pine(1, leaf2), K.pine(2, leaf2), K.pine(3, night ? 0x2a5e44 : 0x47905a)], 260, { outline: 0.05 });
  const bands: [number, [number, number], [number, number]][] = [
    [3.4, [-2.4, -4.4], [0.85, 1.1]],
    [1.9, [-5, -10], [0.95, 1.3]],
    [1.15, [-11, -24], [1.1, 1.6]],
  ];
  bands.forEach(([every, z, sc], bi) => {
    if (spec.kind === "arena" && bi === 0) return;
    for (const s of b.spots({ every, z, seed: 30 + bi, clear: bi < 2 ? clear : [] })) {
      const tint = grey(0.82 + s.r() * 0.22);
      if (s.r() < 0.55) trees.add(Math.floor(s.r() * 3), s.x, 0, s.z, sc[0] + s.r() * (sc[1] - sc[0]), s.r() * 6, tint);
      else pines.add(Math.floor(s.r() * 3), s.x, 0, s.z, sc[0] + s.r() * (sc[1] - sc[0]), s.r() * 6, tint);
    }
  });
  trees.done();
  pines.done();

  // Path-side details: bushes, flowers, grass, mushrooms, rocks.
  const bushes = variants(b, [K.bush(1, night ? 0x2f6a44 : 0x4e8f37, night ? 0xb8a0ff : 0xf28fb0), K.bush(2, night ? 0x356f48 : 0x5aa042), K.bush(3, night ? 0x2a6040 : 0x48863a, 0xffe066)], 160, { outline: 0.03 });
  for (const s of b.spots({ every: 2.4, z: [-1.25, -1.9], seed: 41, clear })) bushes.add(Math.floor(s.r() * 3), s.x, 0, s.z, 0.8 + s.r() * 0.5, s.r() * 6);
  for (const s of b.spots({ every: 6, z: [1.3, 1.9], seed: 42 })) bushes.add(Math.floor(s.r() * 3), s.x, 0, s.z, 0.45 + s.r() * 0.2, s.r() * 6);
  bushes.done();
  const petals = night ? [0x9fd8ff, 0xc8a8ff, 0xffffff, 0x8fe3c0] : [0xff7eb6, 0xffe066, 0xffffff, 0xb784ff];
  const flowers = variants(b, petals.map((c) => K.flower(c)), 500, { outline: 0, cast: false });
  for (const s of b.spots({ every: 0.45, z: [-1.05, -6], seed: 43, clear })) flowers.add(Math.floor(s.r() * 4), s.x, 0, s.z, 0.8 + s.r() * 0.6, s.r() * 6);
  for (const s of b.spots({ every: 1.4, z: [0.95, 2.4], seed: 44 })) flowers.add(Math.floor(s.r() * 4), s.x, 0, s.z, 0.55 + s.r() * 0.35, s.r() * 6);
  flowers.done();
  const grass = variants(b, [K.grassTuft(night ? 0x3d7a50 : 0x6db34b), K.grassTuft(night ? 0x2f6844 : 0x5aa042)], 700, { outline: 0, cast: false });
  for (const s of b.spots({ every: 0.3, z: [-1.0, -3.5], seed: 45 })) grass.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.8 + s.r() * 0.7, s.r() * 6);
  for (const s of b.spots({ every: 0.7, z: [0.9, 2.6], seed: 46 })) grass.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.45 + s.r() * 0.35, s.r() * 6);
  grass.done();
  const mushMat = night ? K.toon(0xffffff, { vertexColors: true, emissive: 0x1f6f8a, emissiveIntensity: 0.9 }) : undefined;
  const mush = variants(b, [K.mushroom(night ? 0x5fd3ff : 0xc8553d), K.mushroom(night ? 0x8fe3ff : 0xd96a4a)], 120, { outline: 0.02, mat: mushMat });
  for (const s of b.spots({ every: 3.2, z: [-1.3, -5], seed: 47, clear })) mush.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.8 + s.r() * 0.9, s.r() * 6);
  mush.done();
  if (night) {
    for (const s of b.spots({ every: 7, z: [-1.4, -4], seed: 47, clear })) {
      const h = K.halo(0x5fd3ff, 1.4, 0.35);
      h.position.set(s.x, 0.4, s.z);
      b.root.add(h);
    }
  }
  const rocks = variants(b, [K.rock(1, night ? 0x5a5a72 : 0x9a8f80), K.rock(2, night ? 0x4e4e66 : 0x8a8070)], 80, { outline: 0.03 });
  for (const s of b.spots({ every: 5, z: [-1.4, -7], seed: 48, clear })) rocks.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.5 + s.r() * 0.9, s.r() * 6);
  for (const s of b.spots({ every: 9, z: [1.3, 2.6], seed: 49 })) rocks.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.35 + s.r() * 0.3, s.r() * 6);
  rocks.done();

  // Set pieces.
  const lm = spec.landmarks ?? {};
  if (lm["troll-bridge"] !== undefined) bridge(b, u(lm["troll-bridge"]), night);
  if (lm["witch-house"] !== undefined) gingerHouse(b, u(lm["witch-house"]), night);
  if (lm.beanstalk !== undefined) beanstalk(b, u(lm.beanstalk), night);
  if (spec.kind === "journey" && spec.length && spec.goal) b.signpost(spec.length, spec.goal, { post: 0x6b4226, board: "#c89055", ink: "#2b1a12" });
  if (spec.kind === "arena") pigHouses(b);

  const motes = night
    ? K.particles({ count: 150, color: 0xd8ff7a, size: 0.2, width: 36, y: [0.3, 3.6], z: [-9, 2.5], drift: [0.12, 0.05], wobble: 0.7, twinkle: true, seed: 7 })
    : K.particles({ count: 70, color: 0xfff3c0, size: 0.08, width: 36, y: [0.4, 4], z: [-8, 3], drift: [0.3, -0.05], wobble: 0.5, twinkle: true, seed: 8 });
  b.root.add(motes.points);
  b.updaters.push((t, _dt, cam) => motes.update(t, cam.position.x));
  extras(b, spec);
  return b.finish(look.actorTint);
}

function bridge(b: WorldBuilder, x: number, night: boolean) {
  const w = K.water(5.4, 95, { deep: night ? 0x1f4a6e : 0x3d9ad0, light: night ? 0x6ab0d8 : 0xc4eeff });
  w.mesh.position.set(x, 0.015, -42);
  b.root.add(w.mesh);
  b.updaters.push((t) => w.update(t));
  const bank = variants(b, [K.rock(5, night ? 0x5a5a72 : 0x9a9488), K.rock(6, night ? 0x4e4e66 : 0x857d70)], 120, { outline: 0.03 });
  const r = K.rng(77);
  for (let z = 3.5; z > -32; z -= 0.9 + r() * 0.6) {
    if (Math.abs(z) < 1.1) continue;
    for (const side of [-1, 1]) bank.add(Math.floor(r() * 2), x + side * (2.75 + r() * 0.3), 0, z, 0.45 + r() * 0.45, r() * 6);
  }
  bank.done();
  // the bridge: planks you walk on, a railing behind, posts in front
  const g = new THREE.Group();
  g.position.set(x, 0, 0);
  for (let i = -8; i <= 8; i++) {
    const p = K.outlined(new THREE.BoxGeometry(0.38, 0.12, 1.75), K.toon(i % 2 ? 0xa06a3a : 0x8f5d31), 0.02);
    p.position.set(i * 0.41, -0.04, 0);
    p.rotation.y = (i % 3) * 0.01;
    g.add(p);
  }
  for (const z of [-0.88, 0.88]) {
    const beam = K.outlined(new THREE.BoxGeometry(7.2, 0.22, 0.16), K.toon(0x7a4a26), 0.025);
    beam.position.set(0, -0.12, z);
    g.add(beam);
  }
  for (let i = -4; i <= 4; i++) {
    const post = K.outlined(new THREE.BoxGeometry(0.14, 0.95, 0.14), K.toon(0x7a4a26), 0.025);
    post.position.set(i * 0.88, 0.45, -0.9);
    g.add(post);
    const low = K.outlined(new THREE.BoxGeometry(0.12, 0.28, 0.12), K.toon(0x7a4a26), 0.02);
    low.position.set(i * 0.88, 0.1, 0.92);
    g.add(low);
  }
  const rail = K.outlined(new THREE.BoxGeometry(7.3, 0.12, 0.12), K.toon(0x8a5a33), 0.025);
  rail.position.set(0, 0.92, -0.9);
  g.add(rail);
  b.root.add(g);
}

function gingerHouse(b: WorldBuilder, x: number, night: boolean) {
  const g = new THREE.Group();
  g.position.set(x, 0, -3.9);
  const walls = K.outlined(new THREE.BoxGeometry(3.3, 2.1, 2.5), K.toon(0xb4703a), 0.05);
  walls.position.y = 1.05;
  g.add(walls);
  const shape = new THREE.Shape([new THREE.Vector2(-2.05, 0), new THREE.Vector2(2.05, 0), new THREE.Vector2(0, 1.6)]);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: false });
  roofGeo.translate(0, 0, -1.45);
  const roof = K.outlined(roofGeo, K.toon(0x8a4f26), 0.05);
  roof.position.y = 2.1;
  g.add(roof);
  // icing along the gable
  const icing = K.toon(0xffffff);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    for (const side of [-1, 1]) {
      const blob = K.outlined(new THREE.IcosahedronGeometry(0.13, 0), icing, 0.015);
      blob.position.set(side * 2.05 * (1 - t), 2.1 + 1.6 * t, 1.5);
      g.add(blob);
    }
  }
  const candy = [0xff5f7e, 0x58c7ff, 0xffe066, 0x8fe36a, 0xff9ff3];
  for (let i = 0; i < 10; i++) {
    const c = K.outlined(new THREE.IcosahedronGeometry(0.13, 1), K.toon(candy[i % 5]), 0.015);
    c.position.set(-1.45 + i * 0.32, 1.95, 1.27);
    g.add(c);
  }
  for (let i = 0; i < 5; i++) {
    const gum = K.outlined(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), K.toon(candy[(i + 2) % 5]), 0.02);
    gum.position.set(0, 3.68, -1.1 + i * 0.55);
    g.add(gum);
  }
  const door = K.outlined(new THREE.BoxGeometry(0.75, 1.25, 0.1), K.toon(0x6b3a1c), 0.03);
  door.position.set(0.85, 0.63, 1.27);
  g.add(door);
  const winMat = night ? K.glow(0xffd98a) : K.toon(0xffe9a8);
  const win = K.outlined(new THREE.BoxGeometry(0.75, 0.62, 0.1), winMat, 0.03);
  win.position.set(-0.85, 1.15, 1.27);
  g.add(win);
  if (night) {
    const h = K.halo(0xffc070, 2.4, 0.5);
    h.position.set(-0.85, 1.15, 1.5);
    g.add(h);
  }
  // candy cane and lollipops in the yard
  const cane = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const seg = K.outlined(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), K.toon(i % 2 ? 0xe23d5a : 0xffffff), 0.015);
    seg.position.y = 0.1 + i * 0.2;
    cane.add(seg);
  }
  const hook = K.outlined(new THREE.TorusGeometry(0.18, 0.08, 6, 12, Math.PI), K.toon(0xffffff), 0.015);
  hook.position.set(0.18, 1.42, 0);
  cane.add(hook);
  cane.position.set(-2.3, 0, 1.6);
  g.add(cane);
  for (const [lx, c] of [[2.25, 0xff7eb6], [2.9, 0x7ff3a0]] as const) {
    const stick = K.outlined(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), K.toon(0xffffff), 0.012);
    stick.position.set(lx, 0.55, 1.5);
    const pop = K.outlined(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), K.toon(c), 0.02);
    pop.rotation.x = Math.PI / 2;
    pop.position.set(lx, 1.15, 1.5);
    g.add(stick, pop);
  }
  b.root.add(g);
}

function beanstalk(b: WorldBuilder, x: number, night: boolean) {
  const g = new THREE.Group();
  g.position.set(x, 0, -1.7);
  const strands: [number, number, number][] = [[0, night ? 0x2f6a3a : 0x3d8a2c, 0.33], [Math.PI, night ? 0x3f7f4a : 0x5cb040, 0.27]];
  for (const [phase, color, radius] of strands) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 70; i++) {
      const y = i * 0.42;
      pts.push(new THREE.Vector3(Math.sin(y * 0.55 + phase) * 0.55, y, Math.cos(y * 0.55 + phase) * 0.55));
    }
    const tube = K.outlined(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, radius, 7, false), K.toon(color), 0.045);
    g.add(tube);
  }
  const leafGeo = K.merge([K.paint(new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.12, 0.42), night ? 0x4f9a5a : 0x7ccf52)]);
  for (let i = 0; i < 26; i++) {
    const y = 0.9 + i * 1.05;
    const a = y * 0.55 + (i % 2) * Math.PI;
    const leafM = K.outlined(leafGeo, shared.vc(), 0.02);
    leafM.position.set(Math.sin(a) * 1.05, y, Math.cos(a) * 1.05);
    leafM.rotation.set(0.2, -a + Math.PI / 2, -0.35);
    g.add(leafM);
  }
  // the giant's cloud at the top
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(K.cloud(60 + i), K.toon(night ? 0x6a6ca8 : 0xffffff));
    c.position.set((i - 2.5) * 2.2, 22 + (i % 2) * 1.5, -1 - (i % 3));
    c.scale.setScalar(2.3);
    g.add(c);
  }
  b.root.add(g);
  b.updaters.push((t) => (g.rotation.z = Math.sin(t * 0.5) * 0.008));
}

function pigHouses(b: WorldBuilder) {
  const house = (x: number, z: number, wall: number, roof: number, kind: "straw" | "sticks" | "bricks") => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const walls = K.outlined(new THREE.BoxGeometry(2.4, 1.6, 2), K.toon(wall), 0.045);
    walls.position.y = 0.8;
    g.add(walls);
    if (kind === "straw") {
      for (let i = 0; i < 9; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.5, 0.02), K.toon(0xb8902c));
        s.position.set(-1.05 + i * 0.26, 0.8, 1.01);
        g.add(s);
      }
      const r = K.outlined(new THREE.ConeGeometry(1.95, 1.5, 9), K.toon(roof), 0.045);
      r.position.y = 2.3;
      g.add(r);
    } else {
      if (kind === "sticks") {
        for (let i = 0; i < 6; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.05, 0.03), K.toon(0x6b4226));
          s.position.set(0, 0.2 + i * 0.25, 1.01);
          g.add(s);
        }
      } else {
        for (let row = 0; row < 7; row++) {
          for (let i = 0; i < 6; i++) {
            const br = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.17, 0.03), K.toon(row % 2 ? 0xa5452f : 0xc25a40));
            br.position.set(-1.0 + i * 0.4 + (row % 2) * 0.2, 0.12 + row * 0.21, 1.01);
            if (Math.abs(br.position.x) < 1.2) g.add(br);
          }
        }
        const chim = K.outlined(new THREE.BoxGeometry(0.35, 0.9, 0.35), K.toon(0x8a3a28), 0.03);
        chim.position.set(0.65, 2.35, -0.3);
        g.add(chim);
        const smoke = K.particles({ count: 14, color: 0xeeeeee, size: 0.5, width: 0.6, y: [2.9, 5], z: [-0.4, -0.2], drift: [0.1, 0.5], wobble: 0.25, additive: false, seed: 31 });
        smoke.points.position.set(-x + 0.65, 0, 0);
        g.add(smoke.points);
        b.updaters.push((t) => smoke.update(t, x));
      }
      const shape = new THREE.Shape([new THREE.Vector2(-1.45, 0), new THREE.Vector2(1.45, 0), new THREE.Vector2(0, 1.15)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.3, bevelEnabled: false });
      geo.translate(0, 0, -1.15);
      const r = K.outlined(geo, K.toon(roof), 0.045);
      r.position.y = 1.6;
      g.add(r);
    }
    const door = K.outlined(new THREE.BoxGeometry(0.55, 0.95, 0.06), K.toon(0x5a3418), 0.025);
    door.position.set(0.3, 0.48, 1.02);
    const win = K.outlined(new THREE.BoxGeometry(0.5, 0.42, 0.06), K.toon(0xffe9a8), 0.025);
    win.position.set(-0.6, 1.0, 1.02);
    g.add(door, win);
    b.root.add(g);
  };
  house(1.8, -4.4, 0xe8c15a, 0xd9a93a, "straw");
  house(5.7, -6.2, 0x9a6a3c, 0x7a4a26, "sticks");
  house(11.2, -4.8, 0xb5503c, 0x7d2f24, "bricks");
}

// ================================================================== DESERT
function palmGeo(seed: number, frond = 0x4e9a3a): THREE.BufferGeometry {
  const r = K.rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const bend = 0.25 + r() * 0.25;
  let top = new THREE.Vector3();
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const seg = new THREE.CylinderGeometry(0.13 - t * 0.03, 0.16 - t * 0.03, 0.4, 7);
    const x = Math.sin(t * 1.2) * bend * 2;
    const y = 0.2 + i * 0.36;
    parts.push(K.paint(K.at(seg, x, y, 0), i % 2 ? 0xa8743c : 0x8f612f));
    top = new THREE.Vector3(x, y + 0.2, 0);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.3;
    const f = new THREE.ConeGeometry(0.22, 2.0, 4);
    f.scale(1, 1, 0.22);
    f.translate(0, 1.0, 0);
    f.rotateZ(-Math.PI / 2 + 0.55 + r() * 0.3); // out and drooping
    f.rotateY(a);
    f.translate(top.x, top.y, top.z);
    parts.push(K.paint(f, K.shade(frond, 0.85 + r() * 0.3)));
  }
  for (let i = 0; i < 3; i++) parts.push(K.paint(K.at(new THREE.IcosahedronGeometry(0.12, 0), top.x + (i - 1) * 0.15, top.y - 0.15, 0.1), 0x6b4226));
  return K.merge(parts);
}

function urnGeo(color: number): THREE.BufferGeometry {
  const pts = [[0, 0], [0.18, 0], [0.3, 0.2], [0.34, 0.4], [0.24, 0.62], [0.13, 0.72], [0.17, 0.8], [0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
  return K.merge([K.paint(new THREE.LatheGeometry(pts, 10), color)]);
}

function desert(spec: WorldSpec): StageWorld {
  const dusk = spec.night;
  const look: Look = dusk
    ? {
        sky: { zenith: 0x2a2058, horizon: 0xf08a5c, ground: 0xb07068, sun: 0xff9a5a, sunDir: [-0.42, 0.07, -1], glow: 1.5 },
        fog: [0xcf8270, 14, 115],
        hemi: [0xa878c8, 0x6a4030, 1.15],
        sun: [0xffb070, 1.9],
        sunFrom: [-18, 8, 10],
        ground: { a: 0xcf9a62, b: 0xbd8a55, far: 0xb07068, path: 0xa87a50, edge: 0x8a6040 },
        actorTint: 0xffd9c4,
      }
    : {
        sky: { zenith: 0x58a4e0, horizon: 0xffe6b0, ground: 0xf0d8a8, sun: 0xfff2c8, sunDir: [0.3, 0.16, -1], glow: 1.2 },
        fog: [0xf4ddb0, 18, 140],
        hemi: [0xfff0d8, 0xc89a5a, 1.35],
        sun: [0xfff0d0, 2.5],
        sunFrom: [10, 22, 12],
        ground: { a: 0xebbd74, b: 0xdcaa60, far: 0xf2d8aa, path: 0xc99a5c, edge: 0xb38246 },
        actorTint: 0xfff6ea,
      };
  const b = new WorldBuilder(spec, look);
  b.ground({ seed: 13, ripples: true });
  if (dusk) {
    b.starsAndMoon(0xffe6c8, [0.42, 0.17, -1]);
    b.sunDisc(0xffa060, look.sky.sunDir, 60);
  } else b.sunDisc(0xfff6d8, look.sky.sunDir, 40);
  if (!dusk) b.clouds(5, 0xfff8ec, 0.95, 8);
  const clear = clearings(spec, 4.5);
  const r = K.rng(31);
  const haze = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(look.fog[0]), k).getHex();
  const farMat = new THREE.MeshToonMaterial({ vertexColors: true, fog: false });

  // mesas, pyramids, dunes
  const mesaGeo = K.merge([K.paint(K.jitter(new THREE.CylinderGeometry(1, 1.15, 1, 9, 2), 0.06, 3), haze(dusk ? 0x9a5a50 : 0xc98a5a, 0.55))]);
  const mesas = new K.Scatter(b.root, mesaGeo, farMat, 30, { cast: false });
  for (let x = b.x0 - 140; x < b.x1 + 140; x += 40 + r() * 40) mesas.add(x, 0, -190 - r() * 70, 14 + r() * 10, r() * 3, undefined, 6 + r() * 6);
  mesas.done();
  const pyrGeo = K.merge([K.paint(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), haze(dusk ? 0xd09a70 : 0xe6c48a, 0.35)), K.paint(new THREE.ConeGeometry(0.12, 0.12, 4).rotateY(Math.PI / 4).translate(0, 0.94, 0), 0xf2c14e)]);
  const pyr = new K.Scatter(b.root, pyrGeo, farMat, 20, { outline: 0, cast: false });
  for (let x = b.x0 - 60; x < b.x1 + 60; x += 30 + r() * 30) {
    const s = 16 + r() * 16;
    pyr.add(x, 0, -85 - r() * 70, s, 0, undefined, s * 0.68);
    if (r() < 0.6) pyr.add(x + s * 0.9, 0, -80 - r() * 60, s * 0.55, 0, undefined, s * 0.38);
  }
  pyr.done();
  const duneGeo = K.merge([K.paint(new THREE.IcosahedronGeometry(1, 2), 0xffffff)]);
  const dunes = new K.Scatter(b.root, duneGeo, K.toon(0xffffff, { vertexColors: true }), 80, { outline: 0, cast: false });
  for (let x = b.x0 - 60; x < b.x1 + 60; x += 7 + r() * 7) {
    const z = -12 - r() * 50;
    const s = 6 + r() * 8;
    const c = dusk ? (r() < 0.5 ? 0xc89060 : 0xb88050) : r() < 0.5 ? 0xf0c47c : 0xe2b068;
    dunes.add(x, -s * 0.72, z, s * 1.6, r() * 3, c, s);
  }
  dunes.done();

  // palms, rocks, urns along the road
  const palms = variants(b, [palmGeo(1), palmGeo(2, 0x5aa642), palmGeo(3, 0x478f36)], 120, { outline: 0.035 });
  for (const s of b.spots({ every: 3.2, z: [-1.8, -11], seed: 51, clear })) {
    if (s.r() < 0.45) continue;
    palms.add(Math.floor(s.r() * 3), s.x, 0, s.z, 0.9 + s.r() * 0.5, s.r() * 6, dusk ? 0xffd2b0 : 0xffffff);
  }
  palms.done();
  const rocks = variants(b, [K.rock(11, dusk ? 0xa8785a : 0xc9a070), K.rock(12, dusk ? 0x986a50 : 0xb48c5a)], 120, { outline: 0.03 });
  for (const s of b.spots({ every: 3.5, z: [-1.3, -9], seed: 52, clear })) rocks.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.5 + s.r() * 1.2, s.r() * 6);
  for (const s of b.spots({ every: 6, z: [1.3, 2.8], seed: 53 })) rocks.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.35 + s.r() * 0.35, s.r() * 6);
  rocks.done();
  const urns = variants(b, [urnGeo(0xc7643a), urnGeo(0xa84f2c)], 40, { outline: 0.02 });
  for (const s of b.spots({ every: 11, z: [-1.4, -2.4], seed: 54, clear })) urns.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.9 + s.r() * 0.4, s.r() * 6);
  urns.done();
  const shrubs = variants(b, [K.grassTuft(dusk ? 0x8a8a4a : 0xa8a050), K.grassTuft(dusk ? 0x7a7a40 : 0x96903f)], 300, { outline: 0, cast: false });
  for (const s of b.spots({ every: 0.9, z: [-1.0, -6], seed: 55, clear })) shrubs.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.8 + s.r() * 0.6, s.r() * 6);
  for (const s of b.spots({ every: 2.2, z: [1.0, 2.6], seed: 56 })) shrubs.add(Math.floor(s.r() * 2), s.x, 0, s.z, 0.5 + s.r() * 0.35, s.r() * 6);
  shrubs.done();

  // lanterns light the road at dusk
  if (dusk) {
    for (const s of b.spots({ every: 6.5, z: [-1.25, -1.25], seed: 57, clear })) lantern(b, s.x, -1.25);
  }

  const lm = spec.landmarks ?? {};
  if (lm["sesame-cave"] !== undefined) cave(b, u(lm["sesame-cave"]), dusk);
  if (lm.sphinx !== undefined) ruins(b, u(lm.sphinx));
  if (spec.kind === "journey" && spec.length && spec.goal) b.signpost(spec.length, spec.goal, { post: 0x8a5a33, board: "#e9c88a", ink: "#2b1a12" });
  if (spec.kind === "arena") oasis(b);

  const sand = K.particles({ count: 160, color: dusk ? 0xffc89a : 0xfff0c8, size: 0.07, width: 36, y: [0.1, 2.6], z: [-6, 3], drift: [1.6, 0.05], wobble: 0.15, additive: true, seed: 9 });
  b.root.add(sand.points);
  b.updaters.push((t, _dt, cam) => sand.update(t, cam.position.x));
  extras(b, spec);
  return b.finish(look.actorTint);
}

function lantern(b: WorldBuilder, x: number, z: number) {
  const pole = K.outlined(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), K.toon(0x5a3c28), 0.02);
  pole.position.set(x, 0.75, z);
  const lamp = K.outlined(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 6), K.glow(0xffb45a), 0.02);
  lamp.position.set(x, 1.6, z);
  const h = K.halo(0xff9a3a, 2.2, 0.55);
  h.position.set(x, 1.6, z + 0.05);
  b.root.add(pole, lamp, h);
  b.updaters.push((t) => (h.material.opacity = 0.45 + Math.sin(t * 5 + x) * 0.08));
}

function cave(b: WorldBuilder, x: number, dusk: boolean) {
  const g = new THREE.Group();
  g.position.set(x, 0, -1.6);
  const r = K.rng(91);
  const cols = dusk ? [0xa87a52, 0x8e6440] : [0xc49a64, 0xa87c4c];
  const boulders: [number, number, number, number][] = [
    [-3.2, 1.4, -0.6, 1.9], [3.2, 1.3, -0.5, 1.8], [-2.0, 3.1, -1.0, 1.6], [2.1, 3.2, -1.1, 1.7], [0, 4.2, -1.3, 1.9], [-4.4, 0.8, 0.2, 1.1], [4.4, 0.9, 0.1, 1.2], [-1.2, 4.9, -1.6, 1.2], [1.4, 5.0, -1.7, 1.3],
  ];
  for (const [bx, by, bz, s] of boulders) {
    const rock = K.outlined(K.merge([K.paint(K.jitter(new THREE.DodecahedronGeometry(1, 0), 0.3, Math.floor(r() * 100)), cols[Math.floor(r() * 2)])]), shared.vc(), 0.05);
    rock.position.set(bx, by, bz);
    rock.scale.set(s * 1.2, s, s);
    g.add(rock);
  }
  // the dark mouth the door (a 2D sprite) stands in
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24, 0, Math.PI), K.toon(0x24160c));
  mouth.position.set(0, 1.35, 0.55);
  const mouthBox = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.35), K.toon(0x24160c));
  mouthBox.position.set(0, 0.68, 0.55);
  g.add(mouth, mouthBox);
  for (let i = 0; i < 5; i++) {
    const glint = K.halo(0xffd25e, 0.7, 0.8);
    glint.position.set(-0.6 + i * 0.3, 0.3 + (i % 2) * 0.25, 0.5);
    g.add(glint);
    b.updaters.push((t) => (glint.material.opacity = 0.4 + 0.4 * Math.max(0, Math.sin(t * 2.5 + i * 1.7))));
  }
  b.root.add(g);
}

function ruins(b: WorldBuilder, x: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, 0);
  const stone = 0xd8b878;
  for (const [ox, oz, h] of [[-6.2, -3.2, 5.2], [5.6, -3.6, 4.6]] as const) {
    const ob = K.outlined(new THREE.CylinderGeometry(0.28, 0.45, h, 4).rotateY(Math.PI / 4), K.toon(stone), 0.04);
    ob.position.set(ox, h / 2, oz);
    const cap = K.outlined(new THREE.ConeGeometry(0.3, 0.5, 4).rotateY(Math.PI / 4), K.toon(0xf2c14e), 0.03);
    cap.position.set(ox, h + 0.25, oz);
    g.add(ob, cap);
  }
  const r = K.rng(61);
  for (let i = 0; i < 6; i++) {
    const h = 0.8 + r() * 2.2;
    const col = K.outlined(K.merge([K.paint(K.jitter(new THREE.CylinderGeometry(0.32, 0.36, h, 8, 1), 0.08, i), stone)]), shared.vc(), 0.035);
    col.position.set(-4 + i * 1.8 + r(), h / 2, -5 - r() * 3);
    col.rotation.z = (r() - 0.5) * 0.15;
    g.add(col);
  }
  for (let i = 0; i < 4; i++) {
    const blk = K.outlined(new THREE.BoxGeometry(1.1, 0.5, 0.7), K.toon(0xc9a86a), 0.03);
    blk.position.set(-3 + i * 2.2, 0.2, -2.3 - (i % 2));
    blk.rotation.y = r() * 0.6;
    g.add(blk);
  }
  b.root.add(g);
}

function oasis(b: WorldBuilder) {
  const w = K.water(1, 1, { deep: 0x2f8fb8, light: 0x9fe4f6 });
  w.mesh.geometry.dispose();
  w.mesh.geometry = new THREE.CircleGeometry(1, 32);
  w.mesh.scale.set(5.2, 2.2, 1);
  w.mesh.position.set(6.2, 0.02, -4.6);
  b.root.add(w.mesh);
  b.updaters.push((t) => w.update(t));
  const palms = variants(b, [palmGeo(4), palmGeo(5, 0x5aa642)], 12, { outline: 0.035 });
  for (const [px, pz, s] of [[2.2, -3.2, 1.2], [3.6, -6.6, 1.0], [9.3, -6.4, 1.15], [10.8, -3.0, 1.3], [0.4, -6.5, 1.0], [12.4, -6.0, 1.05]] as const) palms.add(Math.floor(px) % 2, px, 0, pz, s, px);
  palms.done();
  // a striped tent
  const tent = K.outlined(new THREE.ConeGeometry(1.3, 1.6, 4).rotateY(Math.PI / 4), K.toon(0xd94f4f), 0.04);
  tent.position.set(11.6, 0.8, -8.5);
  b.root.add(tent);
}

// ================================================================== FUTURE
function buildingMaterial(night: boolean, sunFrom: [number, number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        lightDir: { value: new THREE.Vector3(...sunFrom).normalize() },
        win1: { value: new THREE.Color(night ? 0x7ff3ff : 0xbfe8ff) },
        win2: { value: new THREE.Color(night ? 0xff5fd2 : 0xe8f6ff) },
        win3: { value: new THREE.Color(night ? 0xffe066 : 0x9fd0f0) },
        night: { value: night ? 1 : 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld; varying vec3 vN; varying vec3 vTint;
      void main() {
        #include <begin_vertex>
        vec4 wp = vec4(transformed, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          n = mat3(instanceMatrix) * n;
        #endif
        wp = modelMatrix * wp;
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vTint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 lightDir; uniform vec3 win1; uniform vec3 win2; uniform vec3 win3; uniform float night;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vTint;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vN);
        float d = dot(n, lightDir);
        float band = d > 0.45 ? 1.0 : (d > 0.0 ? 0.82 : 0.64);
        vec3 col = vTint * band;
        if (abs(n.y) < 0.5) {
          vec2 uv = abs(n.x) > 0.5 ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
          vec2 cell = uv * vec2(3.4, 3.8);
          vec2 f = fract(cell);
          float w = step(0.2, f.x) * step(f.x, 0.8) * step(0.22, f.y) * step(f.y, 0.78) * step(0.6, vWorld.y);
          float pick = rand(floor(cell) + floor(vWorld.x * 0.37) * 3.0);
          vec3 wc = pick < 0.33 ? win1 : (pick < 0.66 ? win2 : win3);
          float lit = night > 0.5 ? step(0.62, rand(floor(cell) * 1.7 + 11.0)) : 0.55;
          col = mix(col, night > 0.5 ? mix(col * 0.7, wc, 0.25 + lit * 0.6) : mix(col, wc, lit) * 1.04, w);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

function future(spec: WorldSpec): StageWorld {
  const night = spec.night || spec.kind === "arena";
  const look: Look = night
    ? {
        sky: { zenith: 0x05081c, horizon: 0x3a2266, ground: 0x1c1438, sun: 0xe0e6ff, sunDir: [0.38, 0.16, -1], glow: 0.5 },
        fog: [0x241a4c, 10, 78],
        hemi: [0x6a6ab8, 0x1a1a2a, 1.05],
        sun: [0x9aa8ff, 1.0],
        sunFrom: [10, 18, 10],
        ground: { a: 0x2e3348, b: 0x272c40, far: 0x1e1640, path: 0x1f2334, edge: 0x7ff3ff },
        actorTint: 0xc8ccff,
      }
    : {
        sky: { zenith: 0x58b6e8, horizon: 0xe2f4ff, ground: 0xc8d8e8, sun: 0xfffbe8, sunDir: [0.33, 0.15, -1], glow: 1 },
        fog: [0xd6eaf4, 16, 125],
        hemi: [0xeaf6ff, 0x506070, 1.35],
        sun: [0xffffff, 2.3],
        sunFrom: [10, 22, 14],
        ground: { a: 0x8f9cb0, b: 0x828fa2, far: 0xc8d8e8, path: 0x5e6c80, edge: 0x7ff3ff },
        actorTint: 0xf6f9ff,
      };
  const b = new WorldBuilder(spec, look);
  b.ground({ seed: 17, pathHalf: 0.78 });
  if (night) b.starsAndMoon(0xfff6d6, look.sky.sunDir);
  else b.sunDisc(0xfffbe8, look.sky.sunDir, 38);
  b.clouds(night ? 4 : 9, night ? 0x3a3470 : 0xffffff, night ? 0.8 : 0.95, 12);
  const clear = clearings(spec, 4.5);
  const r = K.rng(71);

  // glowing lane strips
  const stripMat = K.glow(0x7ff3ff);
  for (const z of [-0.8, 0.8]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 80, 0.03, 0.07), stripMat);
    strip.position.set((b.x0 + b.x1) / 2, 0.02, z);
    b.root.add(strip);
  }

  // buildings: near shops, mid towers, far skyscrapers
  const bmat = buildingMaterial(night, look.sunFrom);
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const palette = night ? [0x3a3f63, 0x2f3456, 0x463a6e, 0x30476a] : [0xe8eef6, 0xcfdcec, 0xb8cce6, 0xdfe6f0];
  const near = new K.Scatter(b.root, box, bmat, 200, { outline: 0.03 });
  const mid = new K.Scatter(b.root, box, bmat, 260, { outline: 0.05 });
  const far = new K.Scatter(b.root, box, bmat, 300, { cast: false });
  const tint = () => palette[Math.floor(r() * palette.length)];
  const placeRow = (sc: K.Scatter, every: number, z: [number, number], w: [number, number], h: [number, number], skipClear: boolean) => {
    for (let x = b.x0 - 40; x < b.x1 + 40; x += every * (0.7 + r() * 0.6)) {
      if (skipClear && clear.some((c) => Math.abs(x - c.x) < c.r + 1)) continue;
      const ww = w[0] + r() * (w[1] - w[0]);
      const hh = h[0] + r() * (h[1] - h[0]);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z[0] + r() * (z[1] - z[0])), new THREE.Quaternion(), new THREE.Vector3(ww, hh, ww * (0.7 + r() * 0.5)));
      sc.addMatrix(m, tint());
    }
    sc.done();
  };
  placeRow(near, 6.5, [-5, -7.5], [2.2, 3.2], [1.6, 3.2], true);
  placeRow(mid, 4.4, [-15, -32], [2.6, 4.6], [6, 15], false);
  placeRow(far, 5.5, [-44, -120], [5, 9], [18, 44], false);

  // rooftop beacons and neon signs
  if (night) {
    for (let i = 0; i < mid.mesh.count; i += 3) {
      const m = new THREE.Matrix4();
      mid.mesh.getMatrixAt(i, m);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      const s = new THREE.Vector3().setFromMatrixScale(m);
      const h = K.halo(0xff4d5e, 1.6, 0.8);
      h.position.set(p.x, s.y + 0.3, p.z);
      b.root.add(h);
      b.updaters.push((t) => (h.material.opacity = 0.2 + 0.7 * Math.max(0, Math.sin(t * 3 + i))));
    }
  }
  const signs = ["BARD FM", "♪ ♪ ♪", "TIME TRAVEL", "HOURGLASS™", "ROBO-PUPS", "NEON NOTES"];
  for (let i = 0; i < near.mesh.count; i += 2) {
    const m = new THREE.Matrix4();
    near.mesh.getMatrixAt(i, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const s = new THREE.Vector3().setFromMatrixScale(m);
    const tex = K.textTexture(signs[i % signs.length], { w: 512, h: 128, bg: "#120c26", ink: i % 4 ? "#ff5fd2" : "#7ff3ff", border: i % 4 ? "#ff5fd2" : "#7ff3ff", font: "bold 64px Arial, sans-serif" });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.2, s.x * 0.85), 0.55), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
    sign.position.set(p.x, Math.min(s.y - 0.4, 2.6), p.z + s.z / 2 + 0.03);
    b.root.add(sign);
    if (night) {
      const h = K.halo(i % 4 ? 0xff5fd2 : 0x7ff3ff, 3.2, 0.35);
      h.position.copy(sign.position).add(new THREE.Vector3(0, 0, 0.05));
      b.root.add(h);
    }
  }

  // street lamps along the walkway
  for (let x = b.x0; x < b.x1; x += 5.5) {
    if (clear.some((c) => Math.abs(x - c.x) < 1.5)) continue;
    const pole = K.outlined(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6), K.toon(0x4b5563), 0.02);
    pole.position.set(x, 1.2, -1.35);
    const head = K.outlined(new THREE.BoxGeometry(0.5, 0.12, 0.22), K.glow(night ? 0x7ff3ff : 0xd8fbff), 0.02);
    head.position.set(x + 0.18, 2.42, -1.3);
    b.root.add(pole, head);
    if (night) {
      const h = K.halo(0x7ff3ff, 2.6, 0.45);
      h.position.set(x + 0.18, 2.3, -1.2);
      b.root.add(h);
    }
  }

  // planters with trees (day) and monorail
  if (!night) {
    const trees = variants(b, [K.roundTree(7, 0x6fc75a), K.roundTree(8, 0x5ab84c)], 60, { outline: 0.04 });
    for (const s of b.spots({ every: 7, z: [-2.2, -2.6], seed: 72, clear })) trees.add(Math.floor(s.r() * 2), s.x, 0.25, s.z, 0.75, s.r() * 6);
    trees.done();
  }
  const railY = 6.4;
  const railZ = -24;
  const rail = K.outlined(new THREE.BoxGeometry(b.x1 - b.x0 + 120, 0.22, 0.5), K.toon(night ? 0x3e4660 : 0xd6dee8), 0.03, { cast: false });
  rail.position.set((b.x0 + b.x1) / 2, railY, railZ);
  const railGlow = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 120, 0.05, 0.52), K.glow(night ? 0xff5fd2 : 0x58c7ff));
  railGlow.position.set((b.x0 + b.x1) / 2, railY - 0.12, railZ);
  b.root.add(rail, railGlow);
  for (let x = b.x0 - 50; x < b.x1 + 50; x += 9) {
    const pillar = K.outlined(new THREE.CylinderGeometry(0.22, 0.28, railY, 8), K.toon(night ? 0x343b52 : 0xc4ccd8), 0.03, { cast: false });
    pillar.position.set(x, railY / 2, railZ);
    b.root.add(pillar);
  }
  const train = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const car = K.outlined(new THREE.BoxGeometry(2.6, 0.8, 0.9), K.toon(night ? 0xe8eef6 : 0xffffff), 0.03, { cast: false });
    car.position.set(i * 2.75, 0, 0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.2, 0.92), K.glow(night ? 0xff5fd2 : 0x58c7ff));
    band.position.set(i * 2.75, 0.05, 0);
    train.add(car, band);
  }
  train.position.set(b.x0, railY + 0.6, railZ);
  b.root.add(train);
  b.updaters.push((_t, dt, cam) => {
    train.position.x += dt * 9;
    if (train.position.x > cam.position.x + 60) train.position.x = cam.position.x - 70;
  });

  // flying cars
  const cars: { g: THREE.Group; v: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const body = K.outlined(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8).rotateZ(Math.PI / 2), K.toon([0xff5f7e, 0x58c7ff, 0xffe066, 0xffffff][i % 4]), 0.02, { cast: false });
    const lightF = K.halo(night ? 0xfff6c0 : 0xffffff, night ? 1.1 : 0.6, 0.9);
    lightF.position.x = 0.55;
    const lightB = K.halo(0xff4d5e, night ? 0.9 : 0.5, 0.9);
    lightB.position.x = -0.55;
    g.add(body, lightF, lightB);
    const dir = i % 2 ? 1 : -1;
    g.scale.x = dir;
    g.position.set(b.x0 + r() * (b.x1 - b.x0), 3 + r() * 6, -8 - r() * 30);
    b.root.add(g);
    cars.push({ g, v: dir * (2.5 + r() * 4) });
  }
  b.updaters.push((_t, dt, cam) => {
    for (const c of cars) {
      c.g.position.x += c.v * dt;
      if (c.g.position.x > cam.position.x + 45) c.g.position.x = cam.position.x - 45;
      if (c.g.position.x < cam.position.x - 45) c.g.position.x = cam.position.x + 45;
    }
  });

  const lm = spec.landmarks ?? {};
  if (lm["laser-gate"] !== undefined) checkpoint(b, u(lm["laser-gate"]), night);
  if (lm.nightingale !== undefined) clockTower(b, u(lm.nightingale), night);
  if (spec.kind === "journey" && spec.length && spec.goal) b.signpost(spec.length, spec.goal, { post: 0x4b5563, board: "#241a3a", ink: "#7ff3ff" });
  if (spec.kind === "arena") pods(b);

  if (night) {
    const motes = K.particles({ count: 120, color: 0xff8fe0, size: 0.1, width: 36, y: [0.4, 6], z: [-10, 2.5], drift: [0.2, 0.25], wobble: 0.4, twinkle: true, seed: 14 });
    b.root.add(motes.points);
    b.updaters.push((t, _dt, cam) => motes.update(t, cam.position.x));
  }
  extras(b, spec);
  return b.finish(look.actorTint);
}

function checkpoint(b: WorldBuilder, x: number, night: boolean) {
  const g = new THREE.Group();
  g.position.set(x, 0, -1.7);
  const hazard = K.textTexture("", { w: 64, h: 256, bg: "#f2c14e" });
  const ctx = (hazard.image as HTMLCanvasElement).getContext("2d")!;
  ctx.fillStyle = "#1b1b24";
  for (let y = -64; y < 320; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y + 32);
    ctx.lineTo(64, y + 56);
    ctx.lineTo(0, y + 24);
    ctx.fill();
  }
  hazard.needsUpdate = true;
  for (const side of [-1, 1]) {
    const p = K.outlined(new THREE.BoxGeometry(0.6, 5, 0.6), new THREE.MeshBasicMaterial({ map: hazard, fog: true }), 0.04);
    p.position.set(side * 2.4, 2.5, 0);
    g.add(p);
    const l = K.halo(0xff4d5e, 1.8, 0.9);
    l.position.set(side * 2.4, 5.2, 0.4);
    g.add(l);
    b.updaters.push((t) => (l.material.opacity = Math.sin(t * 6 + side) > 0 ? 0.95 : 0.15));
  }
  const beam = K.outlined(new THREE.BoxGeometry(5.6, 0.7, 0.7), K.toon(night ? 0x3e4756 : 0x6b7584), 0.04);
  beam.position.set(0, 5.2, 0);
  const tex = K.textTexture("CHECKPOINT", { w: 512, h: 96, bg: "#120c26", ink: "#ff4d5e", border: "#ff4d5e", font: "bold 60px Arial, sans-serif" });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.6), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  sign.position.set(0, 5.2, 0.37);
  g.add(beam, sign);
  b.root.add(g);
}

function gearGeo(r: number, teeth: number): THREE.BufferGeometry {
  const parts = [K.paint(new THREE.CylinderGeometry(r, r, 0.2, 24).rotateX(Math.PI / 2), 0xe8c14a)];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.BoxGeometry(r * 0.28, r * 0.28, 0.2);
    t.translate(0, r + r * 0.1, 0);
    t.rotateZ(a);
    parts.push(K.paint(t, 0xd8b03a));
  }
  parts.push(K.paint(new THREE.CylinderGeometry(r * 0.25, r * 0.25, 0.26, 12).rotateX(Math.PI / 2), 0xb08a2a));
  return K.merge(parts);
}

function clockTower(b: WorldBuilder, x: number, night: boolean) {
  const g = new THREE.Group();
  g.position.set(x, 0, -8);
  const body = K.outlined(new THREE.BoxGeometry(3.4, 9, 3.4), K.toon(night ? 0x4a3f6e : 0xd8dce8), 0.06);
  body.position.y = 4.5;
  const top = K.outlined(new THREE.ConeGeometry(2.6, 3, 4).rotateY(Math.PI / 4), K.toon(night ? 0xe8c14a : 0xc9a43a), 0.06);
  top.position.y = 10.5;
  g.add(body, top);
  // the clock face
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff6dc";
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#2b1a12";
  ctx.stroke();
  ctx.fillStyle = "#2b1a12";
  ctx.font = "bold 30px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ["XII", "III", "VI", "IX"].forEach((n, i) => ctx.fillText(n, 128 + Math.sin((i * Math.PI) / 2) * 90, 128 - Math.cos((i * Math.PI) / 2) * 90));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  face.position.set(0, 7, 1.72);
  const handM = K.toon(0x2b1a12);
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.05).translate(0, 0.32, 0), handM);
  const minute = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.05).translate(0, 0.48, 0), handM);
  hour.position.set(0, 7, 1.76);
  minute.position.set(0, 7, 1.78);
  g.add(face, hour, minute);
  const gears = [
    { m: K.outlined(gearGeo(1.1, 12), shared.vc(), 0.03), x: -0.75, y: 3.6, s: 0.6 },
    { m: K.outlined(gearGeo(0.75, 9), shared.vc(), 0.03), x: 0.8, y: 3.0, s: -0.88 },
    { m: K.outlined(gearGeo(0.55, 8), shared.vc(), 0.03), x: 0.45, y: 4.7, s: 1.2 },
  ];
  for (const ge of gears) {
    ge.m.position.set(ge.x, ge.y, 1.8);
    g.add(ge.m);
  }
  if (night) {
    const h = K.halo(0xfff3c4, 4.5, 0.4);
    h.position.set(0, 7, 1.9);
    g.add(h);
  }
  b.root.add(g);
  b.updaters.push((t) => {
    minute.rotation.z = -t * 0.6;
    hour.rotation.z = -t * 0.05;
    for (const ge of gears) ge.m.rotation.z = t * ge.s;
  });
}

function pods(b: WorldBuilder) {
  for (const [x, z, color, s] of [[1.9, -4.5, 0xc9d3de, 0.95], [5.8, -6.3, 0x9ac0d8, 0.85], [11.2, -4.8, 0xd8b0c8, 1]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    const base = K.outlined(new THREE.CylinderGeometry(1.5, 1.6, 0.9, 20), K.toon(color), 0.045);
    base.position.y = 0.45;
    const dome = K.outlined(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), K.toon(color), 0.045);
    dome.position.y = 0.9;
    const door = K.outlined(new THREE.BoxGeometry(0.6, 1.0, 0.1), K.toon(0x3e4756), 0.025);
    door.position.set(0, 0.5, 1.55);
    g.add(base, dome, door);
    for (const wx of [-0.9, 0.9]) {
      const w = K.outlined(new THREE.CircleGeometry(0.28, 16), K.glow(0x7ff3ff), 0.02, { cast: false });
      w.position.set(wx, 1.1, 1.3);
      w.lookAt(new THREE.Vector3(wx * 3, 1.1, 6));
      g.add(w);
    }
    const ant = K.outlined(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), K.toon(0x9aa5b3), 0.015);
    ant.position.y = 2.8;
    const tip = K.halo(0xff4d5e, 0.8, 0.9);
    tip.position.y = 3.3;
    g.add(ant, tip);
    b.root.add(g);
  }
}

// ================================================================== shared extras
function extras(b: WorldBuilder, spec: WorldSpec) {
  if (spec.portalX !== undefined) b.portal(spec.portalX);
  if (spec.campfireX !== undefined) b.campfire(spec.campfireX);
  if (spec.celebrate) b.fireworks();
}

export function buildWorld3d(spec: WorldSpec): StageWorld {
  if (spec.world === "desert") return desert(spec);
  if (spec.world === "future") return future(spec);
  return forest(spec);
}
