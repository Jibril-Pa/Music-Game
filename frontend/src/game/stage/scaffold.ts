/**
 * What every 3D world has: sky, fog, sun/moon light with soft shadows that
 * follow the camera, the ground with the path the bard walks on, clouds,
 * stars, and a list of per-frame animations.
 */

import * as THREE from "three";
import type { SetPiece, WorldId } from "../levels";
import { UNIT, type StageWorld } from "./Stage3D";
import * as K from "./kit";

export interface WorldSpec {
  world: WorldId;
  /** Night (or dusk in the desert). */
  night: boolean;
  /** journey = a walking level; arena = a boss fight; menu = title / tuner / end. */
  kind: "journey" | "arena" | "menu";
  /** Level length in Phaser px (journeys). */
  length?: number;
  landmarks?: Partial<Record<SetPiece, number>>;
  /** The signpost at the end of a journey. */
  goal?: string;
  /** A time portal at this Phaser x. */
  portalX?: number;
  /** A campfire glow at this Phaser x (the tuner). */
  campfireX?: number;
  /** The final ending: fireworks. */
  celebrate?: boolean;
}

export interface Look {
  sky: K.SkyColors;
  fog: [number, number, number];
  hemi: [number, number, number];
  sun: [number, number];
  /** Where the light comes from, relative to what it lights. */
  sunFrom: [number, number, number];
  ground: { a: number; b: number; far: number; path: number; edge: number };
  actorTint: number;
}

export type Updater = (t: number, dt: number, cam: THREE.Camera) => void;

export class WorldBuilder {
  readonly root = new THREE.Group();
  readonly updaters: Updater[] = [];
  /** World extent along x (units). */
  readonly x0: number;
  readonly x1: number;
  readonly fog: THREE.Fog;
  readonly sun: THREE.DirectionalLight;

  constructor(
    readonly spec: WorldSpec,
    readonly look: Look,
  ) {
    const len = (spec.length ?? 1280) / UNIT;
    this.x0 = -30;
    this.x1 = len + 30;
    this.fog = new THREE.Fog(look.fog[0], look.fog[1], look.fog[2]);

    const sky = K.makeSky(look.sky);
    this.root.add(sky);
    this.updaters.push((_t, _dt, cam) => sky.position.copy(cam.position));

    this.root.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2]));
    const sun = new THREE.DirectionalLight(look.sun[0], look.sun[1]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.root.add(sun, sun.target);
    this.sun = sun;
    const from = new THREE.Vector3(...look.sunFrom);
    const texel = 52 / 2048;
    this.updaters.push((_t, _dt, cam) => {
      // Snap to shadow texels so shadows don't shimmer as the camera moves.
      const x = Math.round((cam.position.x + 2) / texel) * texel;
      sun.target.position.set(x, 0, -7);
      sun.position.copy(sun.target.position).add(from);
    });
  }

  /** Ground: grass patchwork with the dirt path the bard walks on (z = 0). */
  ground(opts: { pathHalf?: number; seed?: number; ripples?: boolean } = {}) {
    const g = this.look.ground;
    const half = opts.pathHalf ?? 0.75;
    const r = K.rng(opts.seed ?? 3);
    const rows = [9, 6, 4, 2.8, 2, 1.4, half + 0.2, half, 0.3, -0.3, -half, -half - 0.2, -1.4, -2, -2.8, -4, -6, -9, -13, -18, -26, -38, -55, -80, -120, -180, -300, -500];
    const xs: number[] = [];
    for (let x = this.x0 - 80; x <= this.x1 + 80; x += x < this.x0 || x > this.x1 ? 8 : 1) xs.push(x);
    const pos: number[] = [];
    const col: number[] = [];
    const ca = new THREE.Color(g.a);
    const cb = new THREE.Color(g.b);
    const cfar = new THREE.Color(g.far);
    const cpath = new THREE.Color(g.path);
    const cedge = new THREE.Color(g.edge);
    const tmp = new THREE.Color();
    for (let j = 0; j < rows.length - 1; j++) {
      const z0 = rows[j];
      const z1 = rows[j + 1];
      const zc = (z0 + z1) / 2;
      for (let i = 0; i < xs.length - 1; i++) {
        const xa = xs[i];
        const xb = xs[i + 1];
        for (const tri of [[xa, z0, xb, z0, xa, z1], [xb, z0, xb, z1, xa, z1]]) {
          pos.push(tri[0], 0, tri[1], tri[2], 0, tri[3], tri[4], 0, tri[5]);
          const n = r();
          if (Math.abs(zc) < half) {
            tmp.copy(cpath).multiplyScalar(0.92 + n * 0.14);
          } else if (Math.abs(zc) < half + 0.2) {
            tmp.copy(cedge).multiplyScalar(0.95 + n * 0.1);
          } else {
            tmp.copy(ca).lerp(cb, opts.ripples ? 0.5 + 0.5 * Math.sin(xa * 1.3 + zc * 0.7) : n);
            const far = THREE.MathUtils.smoothstep(-zc, 18, 160);
            tmp.lerp(cfar, far);
          }
          for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, K.toon(0xffffff, { vertexColors: true }));
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Scatter positions along the world, skipping clearings. */
  spots(opts: { every: number; z: [number, number]; seed: number; clear?: { x: number; r: number }[]; jitterX?: number }) {
    const r = K.rng(opts.seed);
    const out: { x: number; z: number; r: () => number }[] = [];
    for (let x = this.x0; x < this.x1; x += opts.every * (0.6 + r() * 0.8)) {
      const z = opts.z[0] + r() * (opts.z[1] - opts.z[0]);
      const xx = x + (r() - 0.5) * (opts.jitterX ?? 0);
      if (opts.clear?.some((c) => Math.abs(xx - c.x) < c.r)) continue;
      out.push({ x: xx, z, r });
    }
    return out;
  }

  clouds(count: number, color: number, opacity = 1, seed = 4) {
    const r = K.rng(seed);
    const group = new THREE.Group();
    const mat = K.toon(color, { transparent: opacity < 1, opacity });
    const geos = [K.cloud(seed), K.cloud(seed + 1), K.cloud(seed + 2)];
    const items: { m: THREE.Mesh; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geos[i % 3], mat);
      const z = -45 - r() * 90;
      m.position.set(this.x0 + r() * (this.x1 - this.x0 + 60), 9 + r() * 10 + (-z - 45) * 0.08, z);
      m.scale.setScalar(2 + r() * 2.5);
      m.castShadow = false;
      m.receiveShadow = false;
      group.add(m);
      items.push({ m, speed: 0.15 + r() * 0.3 });
    }
    this.root.add(group);
    this.updaters.push((_t, dt) => {
      for (const it of items) {
        it.m.position.x += it.speed * dt;
        if (it.m.position.x > this.x1 + 60) it.m.position.x = this.x0 - 40;
      }
    });
  }

  starsAndMoon(moonColor = 0xfff6d6, moonDir: [number, number, number] = [0.36, 0.16, -1]) {
    const st = K.stars(420);
    this.root.add(st);
    const dir = new THREE.Vector3(...moonDir).normalize();
    const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 40), new THREE.MeshBasicMaterial({ color: moonColor, fog: false }));
    const moonGlow = K.halo(0xc8d4ff, 260, 0.55);
    this.root.add(moon, moonGlow);
    this.updaters.push((_t, _dt, cam) => {
      st.position.copy(cam.position);
      moon.position.copy(cam.position).addScaledVector(dir, 1100);
      moon.lookAt(cam.position);
      moonGlow.position.copy(moon.position);
    });
  }

  sunDisc(color: number, dir: [number, number, number], size = 46) {
    const d = new THREE.Vector3(...dir).normalize();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(size, 40), new THREE.MeshBasicMaterial({ color, fog: false }));
    const g = K.halo(color, size * 9, 0.6);
    this.root.add(disc, g);
    this.updaters.push((_t, _dt, cam) => {
      disc.position.copy(cam.position).addScaledVector(d, 1100);
      disc.lookAt(cam.position);
      g.position.copy(disc.position);
    });
  }

  /** A swirling time portal, standing on the path at Phaser x. */
  portal(px: number) {
    const x = px / UNIT;
    const g = new THREE.Group();
    g.position.set(x, 1.75, -0.5);
    const ring = K.outlined(new THREE.TorusGeometry(1.25, 0.17, 10, 40), K.toon(0x8a5cff, { emissive: 0x3a1c8a }), 0.035, { cast: false });
    ring.scale.y = 1.32;
    const swirl = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float time; varying vec2 vUv;
        #include <common>
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float a = atan(p.y, p.x);
          float bands = sin(a * 3.0 + r * 14.0 - time * 3.5) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.35, 0.15, 0.85), vec3(0.45, 0.95, 1.0), bands);
          c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.35, 0.0, r));
          float alpha = smoothstep(1.0, 0.85, r);
          gl_FragColor = vec4(c, alpha * 0.92);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), swirl);
    disc.scale.y = 1.32;
    const glowS = K.halo(0x9a6cff, 7, 0.75);
    glowS.position.z = -0.1;
    const sparks = K.particles({ count: 40, color: 0xd6c4ff, size: 0.18, width: 3, y: [-1.6, 1.6], z: [-0.2, 0.3], drift: [0, 0.6], wobble: 0.5, twinkle: true, seed: 12 });
    sparks.points.position.set(-x, 0, 0);
    g.add(glowS, disc, ring, sparks.points);
    this.root.add(g);
    this.updaters.push((t) => {
      swirl.uniforms.time.value = t;
      ring.rotation.z = Math.sin(t * 0.8) * 0.05;
      g.scale.setScalar(1 + Math.sin(t * 2) * 0.02);
      sparks.update(t, x);
    });
  }

  /** Warm flickering firelight (the tuner's campfire is a 2D sprite on top). */
  campfire(px: number) {
    const light = new THREE.PointLight(0xffa04a, 25, 9, 1.6);
    light.position.set(px / UNIT, 0.7, 0.4);
    const h = K.halo(0xffa04a, 5, 0.5);
    h.position.copy(light.position);
    this.root.add(light, h);
    this.updaters.push((t) => {
      const f = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
      light.intensity = 25 * f;
      h.material.opacity = 0.45 * f;
    });
  }

  /** Fireworks for the final ending. */
  fireworks() {
    const bursts: { p: THREE.Points; born: number; v: Float32Array }[] = [];
    let next = 0;
    this.updaters.push((t, dt) => {
      if (t > next) {
        next = t + 0.6 + Math.random() * 0.6;
        const n = 90;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(n * 3);
        const v = new Float32Array(n * 3);
        const cx = 1 + Math.random() * 11;
        const cy = 4.5 + Math.random() * 2.5;
        for (let i = 0; i < n; i++) {
          pos.set([cx, cy, -6], i * 3);
          const a = Math.random() * Math.PI * 2;
          const b = Math.random() * Math.PI;
          const s = 3 + Math.random() * 1.2;
          v.set([Math.cos(a) * Math.sin(b) * s, Math.cos(b) * s, Math.sin(a) * Math.sin(b) * s * 0.5], i * 3);
        }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const color = [0xffe066, 0xff7eb6, 0x7ff3ff, 0x8fe36a][Math.floor(Math.random() * 4)];
        const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.5, map: K.radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        this.root.add(p);
        bursts.push({ p, born: t, v });
      }
      for (const b of bursts) {
        const age = t - b.born;
        const pos = b.p.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          b.v[i * 3 + 1] -= 2.2 * dt;
          pos.setXYZ(i, pos.getX(i) + b.v[i * 3] * dt, pos.getY(i) + b.v[i * 3 + 1] * dt, pos.getZ(i) + b.v[i * 3 + 2] * dt);
        }
        pos.needsUpdate = true;
        (b.p.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / 1.6);
      }
      while (bursts.length && t - bursts[0].born > 1.7) {
        const b = bursts.shift()!;
        this.root.remove(b.p);
        b.p.geometry.dispose();
        (b.p.material as THREE.Material).dispose();
      }
    });
  }

  /** The signpost at the end of the level. */
  signpost(px: number, label: string, style: { post: number; board: string; ink: string }) {
    const x = px / UNIT;
    const post = K.outlined(new THREE.BoxGeometry(0.16, 1.9, 0.16), K.toon(style.post), 0.03);
    post.position.set(x, 0.95, -1.1);
    const tex = K.textTexture(label, { w: 640, h: 150, bg: style.board, ink: style.ink, border: "#2b1a12" });
    const wood = K.toon(style.post);
    const face = new THREE.MeshBasicMaterial({ map: tex });
    const board = K.outlined(new THREE.BoxGeometry(2.6, 0.62, 0.08), [wood, wood, wood, wood, face, wood] as unknown as THREE.Material, 0.03);
    board.position.set(x, 1.75, -1.0);
    this.root.add(post, board);
  }

  finish(actorTint: number): StageWorld {
    const updaters = this.updaters;
    const root = this.root;
    return {
      root,
      fog: this.fog,
      actorTint,
      update: (t, dt, cam) => {
        for (const u of updaters) u(t, dt, cam);
      },
      dispose: () => K.disposeTree(root),
    };
  }
}
