import type Phaser from "phaser";
import { GROUND_Y } from "../fx";

/** A static storybook forest for menus. */
export function forestBackdrop(scene: Phaser.Scene, night = false) {
  const sky = scene.add.graphics().setDepth(-100);
  if (night) sky.fillGradientStyle(0x1d2140, 0x1d2140, 0x4a3f6b, 0x4a3f6b, 1).fillRect(0, 0, 1280, 720);
  else sky.fillGradientStyle(0xf9d9a6, 0xf9d9a6, 0xbfe0e0, 0xbfe0e0, 1).fillRect(0, 0, 1280, 720);
  if (night) {
    scene.add.circle(1040, 130, 56, 0xfff6d6).setDepth(-99);
    for (let i = 0; i < 40; i++) scene.add.circle((i * 331) % 1280, (i * 97) % 320, 2, 0xffffff, 0.8).setDepth(-99);
  } else scene.add.circle(980, 150, 70, 0xfff1c4).setDepth(-99);
  const tint = night ? 0x6d6aa0 : 0xffffff;
  scene.add.image(640, 160, "hills_far").setOrigin(0.5, 0).setDepth(-90).setTint(tint);
  scene.add.image(640, 210, "hills_mid").setOrigin(0.5, 0).setDepth(-85).setTint(tint);
  scene.add.image(640, 200, "forest_far").setOrigin(0.5, 0).setDepth(-80).setTint(tint);
  scene.add.image(640, 220, "forest_mid").setOrigin(0.5, 0).setDepth(-75).setTint(tint);
  scene.add.tileSprite(0, GROUND_Y - 8, 1280, 150, "ground").setOrigin(0, 0).setDepth(1).setTint(tint);
  for (const [x, k, s] of [[120, "tree", 1.1], [380, "pine", 0.9], [1150, "tree", 1], [930, "pine", 0.8]] as const) {
    scene.add.image(x, GROUND_Y + 6, k).setOrigin(0.5, 1).setScale(s).setDepth(2).setTint(tint);
  }
  scene.add.image(250, GROUND_Y + 10, "mushroom").setOrigin(0.5, 1).setDepth(3).setTint(tint);
  scene.add.image(1020, GROUND_Y + 14, "bush").setOrigin(0.5, 1).setDepth(3).setTint(tint);
}
