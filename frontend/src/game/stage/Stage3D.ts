/**
 * The 2.5D stage: a real 3D world (Three.js) rendered on a canvas behind
 * Phaser's transparent canvas. Phaser keeps all the gameplay and the 2D
 * characters; the 3D camera is derived from the Phaser camera every frame so
 * the lane the characters walk on (z = 0) lines up with Phaser's world
 * exactly, while everything behind it has true perspective, parallax,
 * lighting, shadows and fog.
 *
 * Units: 1 unit = 100 Phaser px. The lane is the plane z = 0; the ground is
 * y = 0, which is Phaser's GROUND_Y.
 */

import * as THREE from "three";

export const UNIT = 100;
export const LANE_Y = 600; // Phaser GROUND_Y
const VW = 1280;
const VH = 720;

/** What the 3D camera needs from the Phaser camera. */
export interface StageView {
  scrollX: number;
  scrollY: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
}

/** A built world: a group in the scene plus per-frame animation. */
export interface StageWorld {
  root: THREE.Object3D;
  fog?: THREE.Fog;
  /** Called every frame with seconds since start, the frame's delta and the camera. */
  update?(t: number, dt: number, cam: THREE.Camera): void;
  dispose(): void;
  /** Tint for the 2D characters so they sit in the light of this world. */
  actorTint: number;
}

export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  readonly canvas: HTMLCanvasElement;
  /** Distance from the camera to the lane (units): the strength of the perspective. */
  depth = 12;
  /** Screen row (Phaser px) where the horizon sits. */
  horizon = 330;
  private world: StageWorld | null = null;
  private worldKey = "";
  private view: StageView = { scrollX: 0, scrollY: 0, zoom: 1, shakeX: 0, shakeY: 0 };
  private t0 = performance.now();
  private last = performance.now();
  private resizeObs: ResizeObserver | null = null;

  constructor(frame: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage3d";
    frame.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x1d2a1f, 1);
    this.camera.matrixAutoUpdate = true;
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(frame);
  }

  /** Render at the frame's real size (crisp on big and high-DPI screens). */
  private resize() {
    const r = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(320, Math.min(2560, Math.round((r?.width ?? VW) * Math.min(window.devicePixelRatio || 1, 2))));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, Math.round((w * VH) / VW), false);
  }

  /** Swap in a new world (the old one is disposed). Same key = keep the current one. */
  setWorld(key: string, build: () => StageWorld): StageWorld {
    if (this.world && key === this.worldKey) return this.world;
    this.clearWorld();
    this.world = build();
    this.worldKey = key;
    this.scene.add(this.world.root);
    this.scene.fog = this.world.fog ?? null;
    return this.world;
  }

  get actorTint(): number {
    return this.world?.actorTint ?? 0xffffff;
  }

  clearWorld() {
    if (!this.world) return;
    this.scene.remove(this.world.root);
    this.scene.fog = null;
    this.world.dispose();
    this.world = null;
    this.worldKey = "";
  }

  setView(v: StageView) {
    this.view = v;
  }

  /** Phaser screen -> 3D: an off-axis perspective camera whose lane plane maps 1:1 to Phaser's world. */
  private updateCamera() {
    const { scrollX, scrollY, zoom, shakeX, shakeY } = this.view;
    const D = this.depth;
    const f = UNIT * D * zoom; // focal length in Phaser screen px
    const camY = (LANE_Y - this.horizon) / UNIT;
    // Principal point: where the horizon and the zoom centre land on screen.
    const cx = VW / 2 + shakeX;
    const cy = VH / 2 + zoom * (this.horizon - VH / 2 - scrollY) + shakeY;
    this.camera.position.set((scrollX + VW / 2) / UNIT, camY, D);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld();
    const near = 0.1;
    const far = 4000;
    const k = near / f;
    this.camera.projectionMatrix.makePerspective(-cx * k, (VW - cx) * k, cy * k, -(VH - cy) * k, near, far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  /** Where a lane x (Phaser px) is in 3D units. */
  static x(px: number): number {
    return px / UNIT;
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.updateCamera();
    this.world?.update?.((now - this.t0) / 1000, dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObs?.disconnect();
    this.clearWorld();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
