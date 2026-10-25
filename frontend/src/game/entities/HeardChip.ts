import Phaser from "phaser";
import { C, FONT, burst, reducedMotion } from "../fx";

/**
 * What the ear heard, said by the bard: a paper speech bubble over their head after every
 * input. ✓ Em / "Perfect!", ✗ C / "needs Em", a plain chord when there was nothing to hit,
 * "?" for a strum the ear couldn't name. One per scene: a new input replaces the one showing.
 * Gold means "done" only on a Perfect (gold fill and halo); a plain hit is paper with a gold line.
 */
export type HeardKind = "hit" | "perfect" | "miss" | "neutral" | "unclear";
export type HeardTone = "heal";

const INK = "#2b1a12";
const INK_2 = "#6b4e3a";
/** The bubble's centre is this far right of the bard; its tail ends on the top of the beret. */
const OFFSET_X = 8;
const HEAD_Y = -142;
const TAIL = 10;
const MIN_W = 96;
const HOLD_MS = 700;
const HOLD_UNCLEAR_MS = 900;
const FADE_MS = 250;

export class HeardChip {
  /** For probes: what the bubble last said. */
  kind: HeardKind | null = null;
  private readonly box: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly mark: Phaser.GameObjects.Graphics;
  private readonly main: Phaser.GameObjects.Text;
  private readonly line: Phaser.GameObjects.Text;
  private w = MIN_W;
  private h = 46;
  /** Slid left so it never covers the plate the player is reading. */
  private shift = 0;
  private fill: number = C.gold;
  private ink: number = C.ink;
  private halo = false;
  private gilt = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.plate = scene.add.graphics();
    this.mark = scene.add.graphics();
    this.main = scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "28px", fontStyle: "800", color: INK }).setOrigin(0, 0.5);
    this.line = scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "21px", fontStyle: "700", color: INK }).setOrigin(0.5, 0.5);
    this.box = scene.add.container(0, 0, [this.plate, this.mark, this.main, this.line]).setDepth(62).setAlpha(0);
  }

  /** Is it showing (for probes and layout)? */
  get visible(): boolean {
    return this.box.active && this.box.alpha > 0;
  }

  /** The plate's rectangle in world px (tail not included). */
  get bounds(): Phaser.Geom.Rectangle {
    const k = this.box.scaleX;
    return new Phaser.Geom.Rectangle(this.box.x - (this.w / 2) * k, this.box.y - (this.h / 2) * k, this.w * k, this.h * k);
  }

  /** `holdMs`: how long it stays fully opaque (default: HOLD_MS, or HOLD_UNCLEAR_MS for a "?"). */
  show(kind: HeardKind, main: string, line = "", tone?: HeardTone, holdMs?: number) {
    const scene = this.scene;
    if (!this.box.active) return;
    scene.tweens.killTweensOf(this.box);
    this.kind = kind;
    const ticked = kind === "hit" || kind === "perfect";
    const markW = ticked ? 15 : kind === "miss" ? 12 : 0;
    const gap = markW ? 7 : 0;
    this.main.setText(main);
    this.line.setText(line).setVisible(!!line).setColor(kind === "unclear" ? INK_2 : INK);
    const row = markW + gap + this.main.width;
    const w = Math.max(MIN_W, Math.max(row, line ? this.line.width : 0) + 28);
    const h = line ? 74 : 46;
    this.w = w;
    this.h = h;

    // Row 1: the mark, then the chord. Row 2: the line.
    const rowY = line ? -12 : 0;
    const x0 = -row / 2;
    this.mark.clear();
    if (ticked) {
      const cx = x0 + 7;
      this.mark.lineStyle(4.5, C.ink, 1).beginPath().moveTo(cx - 7, rowY).lineTo(cx - 2, rowY + 5).lineTo(cx + 8, rowY - 6).strokePath();
    } else if (kind === "miss") {
      const cx = x0 + 6;
      this.mark.lineStyle(4.5, C.rose, 1).lineBetween(cx - 5.5, rowY - 5.5, cx + 5.5, rowY + 5.5).lineBetween(cx - 5.5, rowY + 5.5, cx + 5.5, rowY - 5.5);
    }
    this.main.setPosition(x0 + markW + gap, rowY + 1);
    this.line.setPosition(0, 20);

    const fill = tone === "heal" ? C.heal : kind === "perfect" ? C.gold : kind === "unclear" ? C.parchment : C.paper;
    const ink = kind === "miss" ? C.rose : kind === "unclear" ? C.ink2 : C.ink;
    this.drawPlate(fill, ink, kind === "perfect", kind === "hit");

    this.box.setAlpha(1);
    if (reducedMotion()) this.box.setScale(1);
    else {
      this.box.setScale(0.85);
      scene.tweens.add({ targets: this.box, scale: 1, duration: 120, ease: "Back.Out" });
    }
    scene.tweens.add({ targets: this.box, alpha: 0, delay: holdMs ?? (kind === "unclear" ? HOLD_UNCLEAR_MS : HOLD_MS), duration: FADE_MS });
    if (kind === "perfect" && !reducedMotion()) {
      burst(scene, this.box.x, this.box.y, { tint: [0xffe066, 0xffffff], count: 8, speed: 140, gravityY: 0, scale: 0.5, lifespan: 450 });
    }
  }

  /**
   * Keep it over the bard (x, y = their feet). If it would cover `avoid` (the plate the player is
   * reading), it slides left, then up.
   */
  follow(x: number, y: number, avoid?: Phaser.Geom.Rectangle | null) {
    const cx = x + OFFSET_X;
    const cy = y + HEAD_Y - TAIL - this.h / 2;
    let dx = 0;
    let dy = 0;
    if (avoid && this.visible) {
      const pad = 8;
      const left = cx - this.w / 2;
      const right = cx + this.w / 2;
      const top = cy - this.h / 2;
      const bottom = cy + this.h / 2 + TAIL;
      if (right + pad > avoid.left && left - pad < avoid.right && bottom + pad > avoid.top && top - pad < avoid.bottom) {
        // Slide left (the tail stays over the bard's head for up to ~40 px), else lift it clear.
        const slide = right + pad - avoid.left;
        if (slide <= 40) dx = -slide;
        else dy = -(bottom + pad - avoid.top);
      }
    }
    if (dx !== this.shift) {
      this.shift = dx;
      // Redraw so the tail keeps pointing at the bard.
      if (this.visible) this.drawPlate(this.fill, this.ink, this.halo, this.gilt);
    }
    this.box.setPosition(cx + dx, cy + dy);
  }

  /** Gone at once (the super's title takes the stage). */
  hide() {
    if (!this.box.active) return;
    this.scene.tweens.killTweensOf(this.box);
    this.box.setAlpha(0);
  }

  destroy() {
    this.box.destroy();
  }

  /** The cut-out plate (paperPlate's look) with a speech tail toward the bard's head; `gilt`: a gold line inside the ink. */
  private drawPlate(fill: number, ink: number, halo: boolean, gilt: boolean) {
    this.fill = fill;
    this.ink = ink;
    this.halo = halo;
    this.gilt = gilt;
    const g = this.plate.clear();
    const { w, h } = this;
    const x = -w / 2;
    const y = -h / 2;
    // Tail: its tip over the beret (the bard is OFFSET_X left of centre, plus any slide).
    const tipX = Phaser.Math.Clamp(-OFFSET_X - this.shift - 2, x + 10, -x - 30);
    const tipY = h / 2 + TAIL;
    const b1 = tipX + 2;
    const b2 = tipX + 20;
    const base = h / 2;
    if (halo) g.fillStyle(C.goldSoft, 0.9).fillRoundedRect(x - 7, y - 7, w + 14, h + 14, 19);
    g.fillStyle(C.ink, 0.3).fillRoundedRect(x + 1, y + 3, w + 6, h + 6, 15).fillTriangle(b1 + 4, base + 4, b2 + 4, base + 4, tipX + 4, tipY + 6);
    g.fillStyle(C.rim, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 15).fillTriangle(b1 - 4, base, b2 + 4, base, tipX - 1, tipY + 4);
    g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, 12);
    if (gilt) g.lineStyle(3, C.gold, 1).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 9);
    g.lineStyle(3, ink, 1).strokeRoundedRect(x, y, w, h, 12);
    // The tail over the plate's edge: fill hides the edge (and the gold line) between its feet, then its two sides.
    const open = gilt ? 5 : 2.5;
    g.fillStyle(fill, 1).fillTriangle(b1, base - open, b2, base - open, tipX, tipY);
    g.lineStyle(3, ink, 1).lineBetween(b1, base, tipX, tipY).lineBetween(b2, base, tipX, tipY);
  }
}
