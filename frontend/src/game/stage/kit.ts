/**
 * Building blocks for the 3D worlds: cel-shaded (toon) materials with ink
 * outlines to match the 2D storybook sprites, low-poly prop geometry with
 * baked vertex colours, instanced scattering, sky, particles, water, signs.
 */

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const INK = 0x2b1a12;

// ------------------------------------------------------------------ random
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ------------------------------------------------------------------ materials
let gradientMap: THREE.DataTexture | null = null;
/** Three light bands: shadow, mid, lit. */
function toonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

/** Cel-shaded material. Use `vertexColors` for geometry built with paint(). */
export function toon(color = 0xffffff, opts: { vertexColors?: boolean; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    vertexColors: !!opts.vertexColors,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
}

/** Unlit glowing material (lamps, windows, neon). */
export function glow(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: true });
}

const outlineMats = new Map<string, THREE.ShaderMaterial>();
/** Inverted-hull ink outline: back faces pushed out along smooth normals. Works with instancing and fog. */
export function outlineMaterial(thickness: number, color = INK): THREE.ShaderMaterial {
  const key = `${thickness}:${color}`;
  let m = outlineMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { thickness: { value: thickness }, color: { value: new THREE.Color(color) } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        uniform float thickness;
        void main() {
          #include <beginnormal_vertex>
          #include <begin_vertex>
          transformed += normalize(objectNormal) * thickness;
          #include <project_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      side: THREE.BackSide,
      fog: true,
    });
    outlineMats.set(key, m);
  }
  return m;
}

const hulls = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** Same shape with shared vertices and smooth normals, so the outline has no cracks. */
export function hullOf(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let h = hulls.get(geo);
  if (!h) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", geo.getAttribute("position").clone());
    if (geo.index) g.setIndex(geo.index.clone());
    h = mergeVertices(g, 1e-3);
    h.computeVertexNormals();
    hulls.set(geo, h);
  }
  return h;
}

/** A mesh with an ink outline. */
export function outlined(geo: THREE.BufferGeometry, mat: THREE.Material, thickness = 0.04, shadows: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadows.cast ?? true;
  mesh.receiveShadow = shadows.receive ?? true;
  if (thickness > 0) {
    const hull = new THREE.Mesh(hullOf(geo), outlineMaterial(thickness));
    hull.castShadow = false;
    hull.receiveShadow = false;
    mesh.add(hull);
  }
  return mesh;
}

// ------------------------------------------------------------------ geometry
/** Bake one colour into a (non-indexed, flat-shaded) geometry. */
export function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

/** Wobble vertices for an organic, hand-made low-poly look (shared vertices move together). */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const r = rng(seed);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
  return geo;
}

/** Merge painted parts into one geometry (one draw call, instancable). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  if (!g) throw new Error("merge failed");
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);

// ------------------------------------------------------------------ instancing
/** Many copies of one prop: one draw call (+ one for the outlines). */
export class Scatter {
  readonly mesh: THREE.InstancedMesh;
  private hull: THREE.InstancedMesh | null = null;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number, opts: { outline?: number; cast?: boolean; receive?: boolean } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.castShadow = opts.cast ?? true;
    this.mesh.receiveShadow = opts.receive ?? true;
    this.mesh.count = 0;
    parent.add(this.mesh);
    if (opts.outline && opts.outline > 0) {
      this.hull = new THREE.InstancedMesh(hullOf(geo), outlineMaterial(opts.outline), capacity);
      this.hull.instanceMatrix = this.mesh.instanceMatrix;
      this.hull.count = 0;
      this.hull.frustumCulled = false;
      parent.add(this.hull);
    }
  }

  add(x: number, y: number, z: number, scale = 1, rotY = 0, tint?: number, sy?: number) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.p.set(x, y, z);
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.s.set(scale, sy ?? scale, scale);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    if (tint !== undefined) this.mesh.setColorAt(this.n, new THREE.Color(tint));
    this.n++;
  }

  /** Add with a full transform (non-uniform sizes, e.g. buildings). */
  addMatrix(m: THREE.Matrix4, tint?: number) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n, m);
    if (tint !== undefined) this.mesh.setColorAt(this.n, new THREE.Color(tint));
    this.n++;
  }

  done() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    if (this.hull) this.hull.count = this.n;
    return this;
  }
}

// ------------------------------------------------------------------ props
export function roundTree(seed: number, leaf = 0x5fa548, trunk = 0x7a4a26): THREE.BufferGeometry {
  const r = rng(seed);
  const parts = [paint(at(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 6), 0, 0.65, 0), trunk)];
  const crowns = 3 + Math.floor(r() * 2);
  for (let i = 0; i < crowns; i++) {
    const rad = 0.55 + r() * 0.35;
    const g = jitter(new THREE.IcosahedronGeometry(rad, 1), 0.18, seed * 7 + i);
    parts.push(paint(at(g, (r() - 0.5) * 0.9, 1.55 + r() * 0.6, (r() - 0.5) * 0.6), i === 0 ? leaf : shade(leaf, 0.9 + r() * 0.2)));
  }
  return merge(parts);
}

export function pine(seed: number, leaf = 0x3a7d48, trunk = 0x6b4226): THREE.BufferGeometry {
  const r = rng(seed);
  const parts = [paint(at(new THREE.CylinderGeometry(0.1, 0.16, 0.7, 6), 0, 0.35, 0), trunk)];
  const tiers = 3 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i++) {
    const rad = 0.85 - i * 0.18;
    const g = jitter(new THREE.ConeGeometry(rad, 1.1 - i * 0.1, 7), 0.08, seed * 3 + i);
    parts.push(paint(at(g, 0, 0.9 + i * 0.62, 0), shade(leaf, 0.85 + i * 0.08)));
  }
  return merge(parts);
}

export function bush(seed: number, leaf = 0x4e8f37, flowers?: number): THREE.BufferGeometry {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = jitter(new THREE.IcosahedronGeometry(0.35 + r() * 0.15, 1), 0.08, seed + i);
    parts.push(paint(at(g, (i - 1) * 0.38, 0.3 + r() * 0.08, (r() - 0.5) * 0.2), shade(leaf, 0.9 + r() * 0.2)));
  }
  if (flowers !== undefined) {
    for (let i = 0; i < 4; i++) parts.push(paint(at(new THREE.IcosahedronGeometry(0.06, 0), (r() - 0.5) * 0.9, 0.45 + r() * 0.25, 0.32), flowers));
  }
  return merge(parts);
}

export function rock(seed: number, color = 0x9a8f80): THREE.BufferGeometry {
  const g = jitter(new THREE.DodecahedronGeometry(0.5, 0), 0.25, seed);
  g.scale(1.3, 0.75, 1);
  return merge([paint(at(g, 0, 0.28, 0), color)]);
}

export function mushroom(cap = 0xc8553d, stem = 0xf6e7c1): THREE.BufferGeometry {
  const parts = [paint(at(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 6), 0, 0.14, 0), stem)];
  const capG = new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(paint(at(capG, 0, 0.26, 0), cap));
  for (const [x, z] of [[0.08, 0.1], [-0.1, 0.05], [0.02, -0.12]]) parts.push(paint(at(new THREE.IcosahedronGeometry(0.035, 0), x, 0.4, z), 0xffffff));
  return merge(parts);
}

export function flower(petal: number): THREE.BufferGeometry {
  return merge([
    paint(at(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), 0, 0.15, 0), 0x4e8f37),
    paint(at(new THREE.IcosahedronGeometry(0.07, 0), 0, 0.32, 0), petal),
    paint(at(new THREE.IcosahedronGeometry(0.03, 0), 0, 0.33, 0.05), 0xffe066),
  ]);
}

export function grassTuft(color = 0x6db34b): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.ConeGeometry(0.05, 0.35 + (i % 2) * 0.12, 3);
    g.rotateZ((i - 1.5) * 0.25);
    parts.push(paint(at(g, (i - 1.5) * 0.06, 0.16, (i % 2) * 0.04), shade(color, 0.9 + i * 0.05)));
  }
  return merge(parts);
}

export function cloud(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(0.8 + r() * 0.7, 1);
    parts.push(paint(at(g, (i - n / 2) * 0.9, r() * 0.5, (r() - 0.5) * 0.6), 0xffffff));
  }
  const g = merge(parts);
  g.scale(1, 0.6, 0.6);
  return g;
}

export function mountain(seed: number, rockColor: number, snow?: number): THREE.BufferGeometry {
  const g = jitter(new THREE.ConeGeometry(1, 1, 7, 3), 0.12, seed).toNonIndexed();
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(rockColor);
  const top = new THREE.Color(snow ?? rockColor);
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = snow !== undefined && y > 0.68 ? top : base.clone().multiplyScalar(0.85 + y * 0.3);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function shade(hex: number, k: number): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

// ------------------------------------------------------------------ sky
export interface SkyColors {
  zenith: number;
  horizon: number;
  ground: number;
  sun: number;
  /** Direction of the sun/moon glow (normalised in the shader). */
  sunDir: [number, number, number];
  glow: number;
}

/** A big gradient dome that follows the camera, with a soft sun/moon glow. */
export function makeSky(c: SkyColors): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(c.zenith) },
      horizon: { value: new THREE.Color(c.horizon) },
      ground: { value: new THREE.Color(c.ground) },
      sunColor: { value: new THREE.Color(c.sun) },
      sunDir: { value: new THREE.Vector3(...c.sunDir).normalize() },
      glow: { value: c.glow },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunColor; uniform vec3 sunDir; uniform float glow;
      varying vec3 vDir;
      #include <common>
      void main() {
        float h = vDir.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(clamp(h * 2.2, 0.0, 1.0), 0.7)) : mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 2.0 + pow(s, 24.0) * 0.35 * glow + pow(s, 4.0) * 0.12 * glow);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ------------------------------------------------------------------ sprites, glows, particles
const radialCache = new Map<string, THREE.CanvasTexture>();
/** A soft round glow texture. */
export function radialTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)"): THREE.CanvasTexture {
  const key = inner + outer;
  let t = radialCache.get(key);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.45)"));
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    radialCache.set(key, t);
  }
  return t;
}

/** An additive glow billboard (halo around lamps, the sun, the moon...). */
export function halo(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

/**
 * Drifting particles that wrap around the camera (fireflies, sand, dust,
 * petals). Animated entirely on the GPU.
 */
export function particles(opts: {
  count: number;
  color: number;
  size: number;
  /** Box around the camera they live in (units). */
  width: number;
  y: [number, number];
  z: [number, number];
  /** Drift (units/s). */
  drift: [number, number];
  /** Wobble amplitude (units). */
  wobble: number;
  twinkle?: boolean;
  additive?: boolean;
  seed?: number;
}) {
  const r = rng(opts.seed ?? 5);
  const n = opts.count;
  const base = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    base[i * 3] = r() * opts.width;
    base[i * 3 + 1] = opts.y[0] + r() * (opts.y[1] - opts.y[0]);
    base[i * 3 + 2] = opts.z[0] + r() * (opts.z[1] - opts.z[0]);
    seeds[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(base, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      camX: { value: 0 },
      width: { value: opts.width },
      drift: { value: new THREE.Vector2(...opts.drift) },
      wobble: { value: opts.wobble },
      size: { value: opts.size },
      color: { value: new THREE.Color(opts.color) },
      tex: { value: radialTexture() },
      twinkle: { value: opts.twinkle ? 1 : 0 },
      yRange: { value: new THREE.Vector2(...opts.y) },
    },
    vertexShader: /* glsl */ `
      uniform float time; uniform float camX; uniform float width; uniform vec2 drift; uniform float wobble; uniform float size; uniform float twinkle; uniform vec2 yRange;
      attribute float seed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.x = mod(p.x + drift.x * time - camX + width * 0.5, width) + camX - width * 0.5;
        float span = yRange.y - yRange.x;
        p.y = yRange.x + mod(p.y - yRange.x + drift.y * time, span);
        p.x += sin(time * 0.7 + seed) * wobble;
        p.y += cos(time * 0.9 + seed * 1.3) * wobble * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * (300.0 / -mv.z);
        vAlpha = twinkle > 0.5 ? 0.35 + 0.65 * (0.5 + 0.5 * sin(time * 3.0 + seed * 5.0)) : 1.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform sampler2D tex;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(tex, gl_PointCoord);
        gl_FragColor = vec4(color, t.a * vAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return {
    points: pts,
    update(t: number, camX: number) {
      mat.uniforms.time.value = t;
      mat.uniforms.camX.value = camX;
    },
  };
}

/** Stars on the sky (follow the camera). */
export function stars(count: number, seed = 9): THREE.Points {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const az = r() * Math.PI * 1.2 - Math.PI * 0.6;
    const el = 0.08 + r() * 0.9;
    pos.set([Math.sin(az) * Math.cos(el) * 1200, Math.sin(el) * 1200, -Math.cos(az) * Math.cos(el) * 1200], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}

// ------------------------------------------------------------------ water
export function water(width: number, depth: number, colors: { deep: number; light: number }): { mesh: THREE.Mesh; update(t: number): void } {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { time: { value: 0 }, deep: { value: new THREE.Color(colors.deep) }, light: { value: new THREE.Color(colors.light) } },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 deep; uniform vec3 light;
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float w = sin(vUv.x * 40.0 + time * 1.6 + sin(vUv.y * 22.0 + time) * 2.0) * sin(vUv.y * 30.0 - time * 1.2);
        vec3 col = mix(deep, light, smoothstep(0.55, 0.75, w));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = false;
  return { mesh, update: (t) => (mat.uniforms.time.value = t) };
}

// ------------------------------------------------------------------ text
/** A signboard with painted text (canvas texture). */
export function textTexture(text: string, opts: { w?: number; h?: number; bg?: string; ink?: string; font?: string; border?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#c89055";
  g.fillRect(0, 0, w, h);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
  }
  g.fillStyle = opts.ink ?? "#2b1a12";
  g.font = opts.font ?? `bold ${Math.round(h * 0.42)}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dispose every geometry, material and texture under `root`. */
export function disposeTree(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
    else if (mm) mats.add(mm);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    // Shared outline materials and the toon gradient are cached for reuse.
    if ([...outlineMats.values()].includes(m as THREE.ShaderMaterial)) continue;
    const mapped = m as THREE.Material & { map?: THREE.Texture | null };
    if (mapped.map && !(mapped.map as THREE.CanvasTexture).isCanvasTexture) mapped.map.dispose();
    else if (mapped.map && ![...radialCache.values()].includes(mapped.map as THREE.CanvasTexture)) mapped.map.dispose();
    m.dispose();
  }
}
