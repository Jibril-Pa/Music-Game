/**
 * Crisp rendering on high-DPI screens, without touching any game code.
 *
 * Phaser keeps a 1280x720 LOGICAL world: scenes, cameras, physics, input and
 * the 3D stage's camera mapping all stay in those pixels. Only Phaser's WebGL
 * backbuffer is device-sized: k device pixels per logical pixel (per axis,
 * capped at K_MAX, the same 2560 px cap as the 3D stage). Phaser computes
 * every viewport and scissor of the default framebuffer in logical pixels,
 * so a small shim scales them where they reach WebGL; the projection stays
 * logical. Text is rasterised at the same density by default (see
 * textResolution); textures come from art-pipeline.ts at 2x.
 *
 * Verified against Phaser 3.90 (WebGLRenderer resize / setScissor /
 * resetScissor / resetViewport / setFramebuffer / preRender,
 * PipelineManager.rebind). With another Phaser version, or the Canvas
 * renderer, the shim stays off and the game renders at 1x as before (the
 * art too: art-pipeline.ts then skips the PNGs and draws it live at 1x).
 * Not supported at k > 1 (unused here): renderer.snapshot, and BitmapMask /
 * PostFX / camera render-to-texture would render at logical resolution.
 */

import Phaser from "phaser";

export const LOGICAL_W = 1280;
export const LOGICAL_H = 720;
/** The highest backbuffer scale: 2560x1440, the 3D stage's cap too (stage/Stage3D.ts). */
export const K_MAX = 2;

/** Device pixels per logical pixel of Phaser's backbuffer (1 until enableHiDpi runs). */
export const deviceScale = { kx: 1, ky: 1 };
/**
 * The game deviceScale belongs to. A remount (Fast Refresh) can boot a new game before the old
 * one is destroyed: only the owner sets the scale, or puts it back to 1.
 */
let owner: Phaser.Game | null = null;

/** The Phaser internals the shim and the logical-size textures (art-pipeline.ts) rely on are verified on 3.90 only. */
export function phaserVerified(): boolean {
  return /^3\.90\./.test(Phaser.VERSION);
}

/** Text raster scale: the device scale plus 25% headroom for scale-up tweens (wolf chip 1.2) and the super's 1.15 zoom. */
export function textResolution(): number {
  return Math.ceil(Math.max(deviceScale.kx, deviceScale.ky) * 1.25 * 4) / 4;
}

// Every scene.add.text(...) is rasterised at textResolution() unless its style sets a resolution.
// (Phaser's own factory, TextFactory.js, plus that default. Don't construct Text directly.)
const autoResText = new WeakSet<Phaser.GameObjects.Text>();
Phaser.GameObjects.GameObjectFactory.remove("text");
Phaser.GameObjects.GameObjectFactory.register(
  "text",
  function (
    this: { scene: Phaser.Scene; displayList: Phaser.GameObjects.DisplayList },
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    const t = new Phaser.GameObjects.Text(this.scene, x, y, text, { ...style, resolution: style?.resolution ?? textResolution() });
    if (style?.resolution === undefined) autoResText.add(t);
    return this.displayList.add(t);
  },
);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Size Phaser's backbuffer to its canvas' device pixels (capped) and keep it
 * there through window resizes and DPR changes (e.g. dragging the window to
 * another screen). Call once the renderer has booted; returns a disposer.
 */
export function enableHiDpi(game: Phaser.Game): () => void {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !phaserVerified()) return () => {};
  const canvas = game.canvas;
  owner = game;
  deviceScale.kx = canvas.width / LOGICAL_W;
  deviceScale.ky = canvas.height / LOGICAL_H;
  installShim(renderer.gl);

  const apply = () => {
    if (owner !== game) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(LOGICAL_W * clamp(Math.round(r.width * dpr) / LOGICAL_W, 1, K_MAX));
    const h = Math.round(LOGICAL_H * clamp(Math.round(r.height * dpr) / LOGICAL_H, 1, K_MAX));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    deviceScale.kx = w / LOGICAL_W;
    deviceScale.ky = h / LOGICAL_H;
    // Logical size again: re-issues the viewport and scissor through the shim.
    renderer.resize(LOGICAL_W, LOGICAL_H);
    retext(game);
  };

  // Size changes: ResizeObserver. A pure DPR change doesn't resize the CSS box, so watch the resolution too.
  const ro = new ResizeObserver(() => apply());
  ro.observe(canvas);
  let mq: MediaQueryList | null = null;
  const onDpr = () => {
    apply();
    watchDpr();
  };
  const watchDpr = () => {
    mq?.removeEventListener("change", onDpr);
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener("change", onDpr);
  };
  watchDpr();
  game.scale.on(Phaser.Scale.Events.RESIZE, apply);
  apply();

  return () => {
    ro.disconnect();
    mq?.removeEventListener("change", onDpr);
    game.scale.off(Phaser.Scale.Events.RESIZE, apply);
    if (owner !== game) return;
    owner = null;
    deviceScale.kx = deviceScale.ky = 1;
  };
}

/**
 * Scales viewport / scissor of the DEFAULT framebuffer from logical to device
 * pixels. Framebuffer-bound calls (render targets) pass through untouched.
 * Phaser flips scissor y with gl.drawingBufferHeight, so that reads logical too.
 */
function installShim(gl: WebGLRenderingContext) {
  const ctx = gl as WebGLRenderingContext & { __hidpi?: boolean };
  if (ctx.__hidpi) return;
  ctx.__hidpi = true;
  const viewport = gl.viewport.bind(gl);
  const scissor = gl.scissor.bind(gl);
  const bindFramebuffer = gl.bindFramebuffer.bind(gl);
  let proto: object | null = Object.getPrototypeOf(gl);
  while (proto && !Object.getOwnPropertyDescriptor(proto, "drawingBufferHeight")) proto = Object.getPrototypeOf(proto);
  const bufferHeight = Object.getOwnPropertyDescriptor(proto!, "drawingBufferHeight")!.get!;
  let fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const sx = (v: number) => Math.round(v * deviceScale.kx);
  const sy = (v: number) => Math.round(v * deviceScale.ky);
  gl.bindFramebuffer = (target, framebuffer) => {
    fbo = framebuffer;
    bindFramebuffer(target, framebuffer);
  };
  gl.viewport = (x, y, w, h) => (fbo ? viewport(x, y, w, h) : viewport(sx(x), sy(y), sx(x + w) - sx(x), sy(y + h) - sy(y)));
  gl.scissor = (x, y, w, h) => (fbo ? scissor(x, y, w, h) : scissor(sx(x), sy(y), sx(x + w) - sx(x), sy(y + h) - sy(y)));
  Object.defineProperty(gl, "drawingBufferHeight", {
    configurable: true,
    get: () => (fbo ? bufferHeight.call(gl) : Math.round(bufferHeight.call(gl) / deviceScale.ky)),
  });
}

/** Re-rasterise default-resolution Text after k changed (containers included). */
function retext(game: Phaser.Game) {
  const res = textResolution();
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const o of list) {
      if (o instanceof Phaser.GameObjects.Text) {
        if (autoResText.has(o) && o.style.resolution !== res) o.setResolution(res);
      } else if (o instanceof Phaser.GameObjects.Container) walk(o.list);
    }
  };
  for (const s of game.scene.getScenes(false)) if (s.children) walk(s.children.list);
}
