/**
 * The code-drawn art, baked to PNG so it stays crisp on high-DPI screens.
 * The design still lives in code (art.ts, art-worlds.ts, art-kit.ts).
 *
 * art-kit's make() records a RECIPE instead of drawing: key, logical size,
 * draw function and finish (the paper cut-out look). Boot loads the baked
 * PNGs (public/art/*.png + manifest.json, written by `npm run bake-art`) and
 * registers each one with its LOGICAL size, so add.image / setScale / flips /
 * tints / particles / physics bodies all work unchanged while the GPU samples
 * ART_SCALE x texels. Anything without a PNG (never baked, failed to load,
 * `?liveart`, or changed since the bake in development) is drawn live at
 * ART_SCALE: the same pixels the bake would write. Art that only the 2D
 * fallback uses (no WebGL 3D stage) is drawn at 1x, as before, the first time
 * a scene needs it (stage/index.ts showWorld).
 */

import Phaser from "phaser";
import { EventBus } from "./EventBus";
import { EV } from "./events";
import { phaserVerified } from "./hidpi";

/** Scale of the baked PNGs and of live-drawn art (texels per logical pixel). */
export const ART_SCALE = 2;
const ART_DIR = "/art/";
const MANIFEST_KEY = "art-manifest";

/**
 * Art used only by the 2D fallback (scenes/worlds.ts, Journey's set-piece
 * scenery) when WebGL 3D isn't available: never baked, drawn at 1x on demand.
 * The tile sprites (ground_*, backdrops) must stay 1x anyway: TileSprite
 * copies frame.cut* straight out of the source image.
 */
export const FALLBACK_2D: ReadonlySet<string> = new Set([
  "tree", "pine", "bush", "mushroom", "cloud", "bridge", "ginger", "house_straw", "house_sticks", "house_bricks", "beanstalk", "cave",
  "palm", "rock", "urn", "oasis", "lamp", "holo_sign", "crate", "pod_a", "pod_b", "pod_c",
  "ground", "ground_sand", "ground_metal",
  "hills_far", "hills_mid", "forest_far", "forest_mid", "dunes_far", "dunes_mid", "dunes_near", "pyramids",
  "city_far", "city_mid", "city_near", "city_far_n", "city_mid_n", "city_near_n",
]);

export interface ArtRecipe {
  key: string;
  /** Logical texture size (paper sprites include PAPER_PAD). */
  w: number;
  h: number;
  /** Offset of the drawing (PAPER_PAD for paper sprites). */
  pad: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
  /** Applied to the k x canvas after drawing (art-kit's paperize). Pixel constants must scale with k. */
  finish?: (canvas: HTMLCanvasElement, k: number) => void;
}

interface ManifestEntry {
  file: string;
  w: number;
  h: number;
  scale: number;
  /** Fingerprint of the recipe (see fingerprint()). */
  fp: string;
  bytes: number;
  mae: number;
  pctOver32: number;
}

export interface ArtManifest {
  version: number;
  scale: number;
  sourceHash: string;
  generated: string;
  textures: Record<string, ManifestEntry>;
}

const isDev = process.env.NODE_ENV !== "production";
const recipes = new Map<string, ArtRecipe>();
/** Keys whose texture is a baked PNG. */
const baked = new Set<string>();
/** Baked keys whose recipe changed since the bake (development only). */
const stale: string[] = [];
let manifest: ArtManifest | null = null;
let fallbackDrawn = false;
let lastScene: Phaser.Scene | null = null;

/**
 * Can this game sample ART_SCALE x textures under logical-size frames (setLogicalSize)? WebGL only (the
 * Canvas renderer can't draw such frames), on the Phaser version it was verified against. Otherwise
 * every texture is drawn live at 1x.
 */
const hiDpiArt = (game: Phaser.Game) => game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer && phaserVerified();
/** `?liveart`: skip the PNGs and draw every texture in code (the bake uses this). */
const liveArtOnly = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("liveart");

/** Boot.preload: the manifest, then every baked PNG it lists (only where hiDpiArt). */
export function preloadArt(scene: Phaser.Scene) {
  if (!hiDpiArt(scene.game) || liveArtOnly()) return;
  scene.load.json(MANIFEST_KEY, `${ART_DIR}manifest.json`);
  scene.load.once(`filecomplete-json-${MANIFEST_KEY}`, (_key: string, _type: string, data?: ArtManifest) => {
    for (const [key, e] of Object.entries(data?.textures ?? {})) scene.load.image(key, `${ART_DIR}${e.file}?v=${e.fp}`);
  });
}

/** Boot.create, before buildTextures(): starts this game's art and gives every loaded PNG its LOGICAL size. */
export function registerBakedArt(scene: Phaser.Scene) {
  recipes.clear();
  baked.clear();
  stale.length = 0;
  fallbackDrawn = false;
  lastScene = scene;
  manifest = hiDpiArt(scene.game) ? ((scene.cache.json.get(MANIFEST_KEY) as ArtManifest | undefined) ?? null) : null;
  if (!manifest?.textures) return;
  for (const [key, e] of Object.entries(manifest.textures)) {
    if (!scene.textures.exists(key)) continue; // failed to load: drawn live by defineArt
    setLogicalSize(scene.textures.get(key), e.w, e.h);
    baked.add(key);
  }
}

/**
 * Registers a k x image under its LOGICAL w x h. The TextureSource reports w x h and the
 * base frame cuts (0, 0, w, h), so the UVs span the whole image (Frame.updateUVs) while
 * quads, origins, flips and physics bodies are sized in logical pixels (MultiPipeline
 * batchSprite draws frame.cutWidth x frame.cutHeight). The GPU texture keeps all k x texels.
 * Not for TileSprite (it copies frame.cut* out of the source image) or the Canvas renderer.
 */
export function setLogicalSize(tex: Phaser.Textures.Texture, w: number, h: number) {
  const src = tex.source[0];
  src.width = w;
  src.height = h;
  tex.get("__BASE").setSize(w, h);
}

/** Called by art-kit's make() for every texture (Boot -> buildTextures). */
export function defineArt(scene: Phaser.Scene, r: ArtRecipe) {
  recipes.set(r.key, r);
  lastScene = scene;
  if (baked.has(r.key)) {
    const e = manifest?.textures[r.key];
    // In development, a recipe that no longer matches its bake is drawn live (and reported).
    if (!isDev || (e && e.w === r.w && e.h === r.h && e.fp === fingerprint(scene, r))) return;
    stale.push(r.key);
    baked.delete(r.key);
    scene.textures.remove(r.key);
  }
  if (scene.textures.exists(r.key)) return;
  if (FALLBACK_2D.has(r.key) && !fallbackDrawn) return; // drawn by ensureFallbackArt() if ever needed
  drawLive(scene, r);
}

/** The 2D-fallback art, drawn (at 1x) the first time a scene runs without the 3D stage. */
export function ensureFallbackArt(scene: Phaser.Scene) {
  if (fallbackDrawn) return;
  fallbackDrawn = true;
  for (const key of FALLBACK_2D) {
    const r = recipes.get(key);
    if (r && !scene.textures.exists(key)) drawLive(scene, r);
  }
}

/** Boot.create, after buildTextures(): tells the developer which art is newer than its bake. */
export function reportStaleArt() {
  if (!stale.length) return;
  const list = stale.slice(0, 6).join(", ") + (stale.length > 6 ? ` +${stale.length - 6} more` : "");
  console.warn(`[art] ${stale.length} texture(s) changed since the last bake, drawn live instead: ${list}. Run \`npm run bake-art\`.`);
  EventBus.emit(EV.toast, `Art changed since the last bake (${list}): run npm run bake-art`);
}

function drawLive(scene: Phaser.Scene, r: ArtRecipe) {
  const k = FALLBACK_2D.has(r.key) || !hiDpiArt(scene.game) ? 1 : ART_SCALE;
  const tex = scene.textures.create(r.key, renderArt(scene, r, k), r.w, r.h);
  tex?.add("__BASE", 0, 0, 0, r.w, r.h);
}

/**
 * make() at k x: the Graphics are scaled by k (so every line width, radius and
 * position scales), then the finish runs at k. A k x render box-filtered down to
 * 1x matches the 1x design (`npm run bake-art` checks it for every texture).
 */
export function renderArt(scene: Phaser.Scene, r: ArtRecipe, k: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(r.w * k);
  canvas.height = Math.round(r.h * k);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.scaleCanvas(k, k);
  if (r.pad) g.translateCanvas(r.pad, r.pad);
  r.draw(g);
  g.generateTexture(canvas, canvas.width, canvas.height);
  g.destroy();
  r.finish?.(canvas, k);
  return canvas;
}

/**
 * FNV-1a of the recipe: size, offset, every Graphics command it records, and the
 * finish's source. Development only (minified code and other JS engines differ).
 */
export function fingerprint(scene: Phaser.Scene, r: ArtRecipe): string {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  if (r.pad) g.translateCanvas(r.pad, r.pad);
  r.draw(g);
  const commands = g.commandBuffer.join(",");
  g.destroy();
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(`${r.w},${r.h},${r.pad};`);
  feed(commands);
  if (r.finish) feed(r.finish.toString());
  return h.toString(16).padStart(8, "0");
}

// Dev only: a TileSprite tiles frame.cut* of the source image, so a 2x texture with a logical
// frame would tile the wrong region. Such art belongs in FALLBACK_2D (kept at 1x).
if (isDev) {
  type TileFactory = { tileSprite: ((...a: unknown[]) => Phaser.GameObjects.TileSprite) & { artChecked?: boolean } };
  const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as TileFactory;
  const original = factory.tileSprite;
  if (!original.artChecked) {
    const checked = function (this: unknown, ...args: unknown[]) {
      const ts = original.apply(this, args);
      // The art it tiles (ts.texture is its own fill canvas); displayTexture isn't in Phaser's typings.
      const tex = (ts as unknown as { displayTexture: Phaser.Textures.Texture }).displayTexture;
      const src = tex.source[0];
      if (src.image && (src.image as HTMLImageElement).width !== src.width)
        console.error(`[art] TileSprite "${tex.key}" uses a ${ART_SCALE}x texture: add the key to FALLBACK_2D in art-pipeline.ts (TileSprites need 1x art).`);
      return ts;
    };
    factory.tileSprite = Object.assign(checked, { artChecked: true });
  }
}

// Dev only: what scripts/bake-art.mjs reads (like window.__game / window.__stage).
if (isDev && typeof window !== "undefined") {
  const scene = () => {
    const s = lastScene;
    return s?.game.scene.getScenes(true)[0] ?? s;
  };
  (window as unknown as { __art?: unknown }).__art = {
    ready: () => recipes.size > 0,
    /** Keys the bake writes: everything but the 2D-fallback art. */
    bakeKeys: () => [...recipes.keys()].filter((k) => !FALLBACK_2D.has(k)).sort(),
    fallbackKeys: () => [...recipes.keys()].filter((k) => FALLBACK_2D.has(k)).sort(),
    meta: (key: string) => {
      const r = recipes.get(key);
      return r ? { key, w: r.w, h: r.h, pad: r.pad, paper: !!r.finish } : null;
    },
    /** Raw RGBA (base64) of a fresh render of `key` at scale k. */
    rgba: (key: string, k: number) => {
      const r = recipes.get(key);
      const s = scene();
      if (!r || !s) return null;
      const c = renderArt(s, r, k);
      const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
      let bin = "";
      for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return { w: c.width, h: c.height, b64: btoa(bin) };
    },
    fingerprint: (key: string) => {
      const r = recipes.get(key);
      const s = scene();
      return r && s ? fingerprint(s, r) : null;
    },
    /** Where the live texture came from: "png", "live", or "deferred" (2D fallback not drawn). */
    source: (key: string) => (baked.has(key) ? "png" : scene()?.textures.exists(key) ? "live" : "deferred"),
    stale: () => [...stale],
  };
}
