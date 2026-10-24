// Copies alphaTab's music font into public/ so the score renders offline
// without any bundler plugin. Runs automatically after `npm install`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@coderline", "alphatab", "dist", "font");
const dest = join(root, "public", "alphatab", "font");
if (!existsSync(src)) {
  console.warn("[copy-alphatab] alphaTab not installed yet, skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-alphatab] copied font to public/alphatab/font");
