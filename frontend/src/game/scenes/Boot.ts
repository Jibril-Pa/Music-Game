import Phaser from "phaser";
import { buildTextures } from "../art";

/** Draws every texture in code, then shows the title. */
export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    buildTextures(this);
    this.scene.start("Title");
  }
}
