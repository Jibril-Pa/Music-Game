import Phaser from "phaser";
import { buildTextures } from "../art";
import { preloadArt, registerBakedArt, reportStaleArt } from "../art-pipeline";
import { EventBus } from "../EventBus";
import { EV } from "../events";
import { CANVAS_FONTS } from "../fonts";

/** Loads what the game needs before the title: the baked art and the storybook fonts. */
export class Boot extends Phaser.Scene {
  /** The storybook fonts, requested in preload so they download alongside the art. */
  private fonts: Promise<unknown> = Promise.resolve();

  constructor() {
    super("Boot");
  }

  preload() {
    this.fonts = loadCanvasFonts();
    // The download's progress for React's loading plate, after each baked PNG. (The manifest comes
    // first and only then queues the PNGs, so the loader's own count would read 1 for a moment.)
    const progress = (file: Phaser.Loader.File) => {
      if (file.type === "image") EventBus.emit(EV.bootProgress, this.load.progress);
    };
    this.load.on(Phaser.Loader.Events.FILE_LOAD, progress);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, progress);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD, progress);
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, progress);
      EventBus.emit(EV.bootProgress, 1);
    });
    // The code-drawn art, baked to PNG at 2x (public/art, `npm run bake-art`).
    preloadArt(this);
  }

  create() {
    // Baked PNGs get their logical size; whatever isn't baked is drawn in code (art-pipeline.ts).
    registerBakedArt(this);
    buildTextures(this);
    reportStaleArt();
    // Canvas text rasterises with whatever font is ready at that moment, so wait for the
    // storybook fonts first (at most 2.5 s more; their @font-face rules live in globals.css).
    let gone = false;
    const leave = () => (gone = true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, leave);
    this.events.once(Phaser.Scenes.Events.DESTROY, leave); // e.g. React StrictMode destroying the game
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
    void Promise.race([this.fonts, timeout]).then(() => {
      if (!gone) this.scene.start("Title");
    });
  }
}

/**
 * document.fonts.load rather than Phaser's loader: the loader keys files by font name,
 * so the italic face of the same family would never load. Never rejects.
 */
function loadCanvasFonts(): Promise<unknown> {
  return Promise.all(CANVAS_FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
}
