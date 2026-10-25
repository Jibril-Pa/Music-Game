#!/usr/bin/env node
/**
 * Bakes the code-drawn art (src/game/art*.ts) to public/art/<key>.png + manifest.json,
 * at ART_SCALE (2x), so it stays crisp on high-DPI screens. No dependencies: drives a
 * headless Chrome over the DevTools protocol against the running dev server, which
 * renders every texture with the game's own code (src/game/art-pipeline.ts, ?liveart).
 *
 *   npm run dev                      # in another terminal
 *   npm run bake-art                 # bake + verify (exit 1 if a texture fails the check)
 *   npm run bake-art -- --sheet      # also write a contact sheet (live 1x | bake->1x | bake | diff) to the temp dir
 *   npm run bake-art -- --accept     # accept MAE increases vs the previous bake (art changed on purpose)
 *   npm run bake-art:check           # no browser: exit 3 if the art sources changed since the bake
 *   node scripts/bake-art.mjs --dump-1x=<dir>    # write today's 1x renders (reference for an identity test)
 *   node scripts/bake-art.mjs --verify-1x=<dir>  # every 1x render must be byte-identical to that dump
 * Options: --base=http://localhost:3000, --keys=hero,wolf (bake only these; others keep their files).
 * Env: CHROME=/path/to/chrome. Needs Node >= 22 (global WebSocket).
 *
 * The check: each texture rendered at 2x, box-filtered down to 1x in premultiplied alpha, is
 * compared with the 1x render of the same code. MAE = mean |difference| (RGBA, 0-255) over pixels
 * covered in either image. Anti-aliasing alone gives 0-5; a forgotten "x k" on a pixel constant in
 * make()/paperize() gives much more. Fails: MAE > 5.5, > 4% of pixels off by more than 32, or MAE
 * up by more than 0.75 since the previous bake (unless --accept).
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(FRONTEND, "public/art");
const MANIFEST = join(OUT_DIR, "manifest.json");
const SOURCES = ["src/game/art.ts", "src/game/art-worlds.ts", "src/game/art-kit.ts", "src/game/art-pipeline.ts"];
const SCALE = 2; // keep in sync with ART_SCALE in src/game/art-pipeline.ts
const MAX_MAE = 5.5;
const MAX_PCT_OVER_32 = 4;
const MAX_MAE_RISE = 0.75;

const argv = process.argv.slice(2);
const opt = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const BASE = opt("base") || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- staleness (no browser)
function sourceHash() {
  const h = createHash("sha256");
  for (const f of SOURCES) h.update(`${f}\n`).update(readFileSync(join(FRONTEND, f)));
  return `sha256:${h.digest("hex")}`;
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return null;
  }
}

if (opt("check")) {
  const m = readManifest();
  const now = sourceHash();
  if (!m) {
    console.log("bake-art: no public/art/manifest.json yet: run `npm run bake-art` (the game draws everything live until then).");
    process.exit(3);
  }
  if (m.sourceHash !== now) {
    console.log(`bake-art: the art sources changed since the bake of ${m.generated} (${SOURCES.join(", ")}).`);
    console.log("Run `npm run bake-art` (with `npm run dev` running). In development stale textures are drawn live and reported.");
    process.exit(3);
  }
  console.log(`bake-art: public/art is up to date (${Object.keys(m.textures).length} textures, baked ${m.generated}).`);
  process.exit(0);
}

// ---------------------------------------------------------------- PNG (deterministic: same pixels, same bytes)
function encodePNG(rgba, w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  const zero = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const up = y ? rgba.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0;
    let bestSum = Infinity;
    // Adaptive filter per row: the one with the smallest sum of |signed bytes| (libpng's heuristic).
    for (let t = 0; t < 5; t++) {
      const c = cand[t];
      let s = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0;
        const b = up[i];
        const cc = i >= 4 ? up[i - 4] : 0;
        let p;
        if (t === 0) p = 0;
        else if (t === 1) p = a;
        else if (t === 2) p = b;
        else if (t === 3) p = (a + b) >> 1;
        else {
          const q = a + b - cc;
          const pa = Math.abs(q - a);
          const pb = Math.abs(q - b);
          const pc = Math.abs(q - cc);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
        }
        const v = (row[i] - p) & 255;
        c[i] = v;
        s += v < 128 ? v : 256 - v;
      }
      if (s < bestSum) {
        bestSum = s;
        best = t;
      }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- the check
/** Box-filter `big` (k x) down to 1x in premultiplied alpha. Returns premultiplied RGBA floats. */
function downsample(big, bw, bh, k) {
  const w = Math.round(bw / k);
  const h = Math.round(bh / k);
  const out = new Float32Array(w * h * 4);
  const kk = k * k;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < k; dy++)
        for (let dx = 0; dx < k; dx++) {
          const i = ((y * k + dy) * bw + (x * k + dx)) * 4;
          const A = big[i + 3];
          r += big[i] * A;
          g += big[i + 1] * A;
          b += big[i + 2] * A;
          a += A;
        }
      const j = (y * w + x) * 4;
      out[j] = r / (kk * 255);
      out[j + 1] = g / (kk * 255);
      out[j + 2] = b / (kk * 255);
      out[j + 3] = a / kk;
    }
  return { w, h, px: out };
}

function compare(one, w, h, down) {
  let sum = 0, n = 0, over8 = 0, over32 = 0, max = 0;
  const diff = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    const A1 = one[j + 3];
    const e =
      (Math.abs((one[j] * A1) / 255 - down.px[j]) +
        Math.abs((one[j + 1] * A1) / 255 - down.px[j + 1]) +
        Math.abs((one[j + 2] * A1) / 255 - down.px[j + 2]) +
        Math.abs(A1 - down.px[j + 3])) /
      4;
    diff[i] = e;
    if (A1 > 0 || down.px[j + 3] > 0) {
      sum += e;
      n++;
      if (e > 8) over8++;
      if (e > 32) over32++;
      if (e > max) max = e;
    }
  }
  const pct = (v) => +((v / Math.max(1, n)) * 100).toFixed(2);
  return { mae: +(sum / Math.max(1, n)).toFixed(3), pctOver8: pct(over8), pctOver32: pct(over32), max: +max.toFixed(1), diff };
}

// ---------------------------------------------------------------- Chrome over CDP
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = {
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
    win32: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"],
  }[process.platform] ?? [];
  return candidates.find((c) => existsSync(c));
}

async function openChrome() {
  if (typeof WebSocket === "undefined") throw Object.assign(new Error("needs Node >= 22 (global WebSocket)"), { code: 2 });
  const chrome = findChrome();
  if (!chrome) throw Object.assign(new Error("Chrome not found: set CHROME=/path/to/chrome"), { code: 2 });
  const profile = mkdtempSync(join(tmpdir(), "bake-art-"));
  const proc = spawn(
    chrome,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--mute-audio",
      // Software 2D canvas: the same pixels on every machine, so unchanged art re-bakes to identical bytes.
      "--disable-accelerated-2d-canvas",
      "--force-color-profile=srgb",
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let port = 0;
  for (let i = 0; i < 200 && !port; i++) {
    try {
      port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
    } catch {
      await sleep(100);
    }
  }
  if (!port) throw Object.assign(new Error("Chrome did not start"), { code: 2 });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    } catch {
      // not ready
    }
    if (!target) await sleep(100);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(typeof m.data === "string" ? m.data : m.data.toString());
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(msg.error.message));
    else p.res(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const version = (await send("Browser.getVersion")).product;
  const close = async () => {
    try {
      await send("Browser.close");
    } catch {
      // gone
    }
    ws.close();
    proc.kill("SIGKILL");
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  };
  return { send, evaluate, close, version };
}

async function openGame(page) {
  await page.send("Page.navigate", { url: `${BASE}/play?liveart` });
  for (let i = 0; i < 400; i++) {
    await sleep(150);
    try {
      if (await page.evaluate("!!(window.__art && window.__art.ready())")) return;
    } catch {
      // navigating / reloading
    }
  }
  throw new Error("the game did not expose window.__art (is the dev server on the current code?)");
}

/** Evaluates in the game page; if a hot reload interrupts, waits for the game and retries. */
async function inGame(page, expression) {
  for (let attempt = 0; ; attempt++) {
    try {
      const v = await page.evaluate(expression);
      if (v !== null && v !== undefined) return v;
      throw new Error(`no result for ${expression.slice(0, 80)}`);
    } catch (err) {
      if (attempt >= 3) throw err;
      await openGame(page);
    }
  }
}

async function render(page, key, k) {
  const r = await inGame(page, `window.__art.rgba(${JSON.stringify(key)}, ${k})`);
  return { w: r.w, h: r.h, px: Buffer.from(r.b64, "base64") };
}

// ---------------------------------------------------------------- contact sheet
function contactSheet(rows) {
  const Z1 = 3, ZB = 1.5, gap = 8;
  const cell = (r) => [r.w * Z1, r.w * Z1, Math.round(r.bw * ZB), r.w * Z1];
  const W = Math.max(...rows.map((r) => cell(r).reduce((a, b) => a + b + gap, gap)));
  const H = rows.reduce((a, r) => a + r.h * Z1 + gap, gap);
  const img = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) img.writeUInt32BE(0x2b1a12ff, i * 4);
  const blit = (src, sw, sh, x0, y0, z, mode) => {
    const dw = Math.round(sw * z), dh = Math.round(sh * z);
    for (let y = 0; y < dh; y++)
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, Math.floor(x / z)), sy = Math.min(sh - 1, Math.floor(y / z));
        const s = (sy * sw + sx) * 4, d = ((y0 + y) * W + (x0 + x)) * 4;
        if (mode === "heat") {
          const e = Math.min(255, src[sy * sw + sx] * 4);
          img[d] = e; img[d + 1] = 0; img[d + 2] = 0; img[d + 3] = 255;
          continue;
        }
        const a = mode === "pm" ? Math.min(255, src[s + 3]) : src[s + 3];
        const un = (v) => (mode === "pm" ? (a ? Math.min(255, (v * 255) / a) : 0) : v);
        // over a mid-grey checker so the paper edge is visible
        const bg = ((x >> 3) + (y >> 3)) & 1 ? 150 : 110;
        img[d] = (un(src[s]) * a + bg * (255 - a)) / 255;
        img[d + 1] = (un(src[s + 1]) * a + bg * (255 - a)) / 255;
        img[d + 2] = (un(src[s + 2]) * a + bg * (255 - a)) / 255;
        img[d + 3] = 255;
      }
  };
  let y = gap;
  for (const r of rows) {
    let x = gap;
    blit(r.one, r.w, r.h, x, y, Z1); x += r.w * Z1 + gap;
    blit(r.down, r.w, r.h, x, y, Z1, "pm"); x += r.w * Z1 + gap;
    blit(r.big, r.bw, r.bh, x, y, ZB); x += Math.round(r.bw * ZB) + gap;
    blit(r.diff, r.w, r.h, x, y, Z1, "heat");
    y += r.h * Z1 + gap;
  }
  return encodePNG(img, W, H);
}

// ---------------------------------------------------------------- main
async function main() {
  try {
    await fetch(`${BASE}/play`);
  } catch {
    throw Object.assign(new Error(`no dev server at ${BASE}: start it with \`npm run dev\``), { code: 2 });
  }
  const page = await openChrome();
  try {
    await openGame(page);
    const keys = (await inGame(page, "window.__art.bakeKeys()")).filter((k) => {
      const only = opt("keys");
      return typeof only !== "string" || only.split(",").includes(k);
    });

    // ---- reference dump / identity test (1x renders)
    const dumpDir = opt("dump-1x");
    const verifyDir = opt("verify-1x");
    if (typeof dumpDir === "string" || typeof verifyDir === "string") {
      // every texture make() defines, the 2D-fallback art included
      const every = await inGame(page, "[...window.__art.bakeKeys(), ...window.__art.fallbackKeys()]");
      if (typeof dumpDir === "string") mkdirSync(dumpDir, { recursive: true });
      const ref = typeof verifyDir === "string" ? JSON.parse(readFileSync(join(verifyDir, "index.json"), "utf8")) : null;
      const index = {};
      let same = 0;
      const differ = [];
      for (const key of every) {
        const r = await render(page, key, 1);
        const sha = createHash("sha256").update(r.px).digest("hex").slice(0, 16);
        index[key] = { key, w: r.w, h: r.h, sha256: sha };
        if (typeof dumpDir === "string") writeFileSync(join(dumpDir, `${key}.png`), encodePNG(r.px, r.w, r.h));
        if (ref) {
          if (ref[key]?.sha256 === sha) same++;
          else differ.push(key);
        }
      }
      if (typeof dumpDir === "string") {
        writeFileSync(join(dumpDir, "index.json"), JSON.stringify(index, null, 1));
        console.log(`bake-art: wrote ${every.length} 1x renders to ${dumpDir}`);
      }
      if (ref) {
        const missing = Object.keys(ref).filter((k) => !index[k]);
        console.log(`bake-art: 1x identity ${same}/${Object.keys(ref).length} byte-identical${differ.length ? `; different: ${differ.join(", ")}` : ""}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
        process.exitCode = differ.length || missing.length ? 1 : 0;
      }
      return;
    }

    // ---- bake
    const prev = readManifest();
    const textures = { ...(typeof opt("keys") === "string" && prev ? prev.textures : {}) };
    const rows = [];
    const failures = [];
    const rises = [];
    let changed = false;
    mkdirSync(OUT_DIR, { recursive: true });
    for (const key of keys) {
      const meta = await inGame(page, `window.__art.meta(${JSON.stringify(key)})`);
      const big = await render(page, key, SCALE);
      const one = await render(page, key, 1);
      const fp = await inGame(page, `window.__art.fingerprint(${JSON.stringify(key)})`);
      const png = encodePNG(big.px, big.w, big.h);
      const file = `${key}.png`;
      const path = join(OUT_DIR, file);
      if (!existsSync(path) || !readFileSync(path).equals(png)) {
        writeFileSync(path, png);
        changed = true;
      }
      const down = downsample(big.px, big.w, big.h, SCALE);
      const c = compare(one.px, one.w, one.h, down);
      textures[key] = { file, w: meta.w, h: meta.h, scale: SCALE, fp, bytes: png.length, mae: c.mae, pctOver32: c.pctOver32 };
      rows.push({ key, ...c, bytes: png.length, w: one.w, h: one.h, bw: big.w, bh: big.h, one: one.px, big: big.px, down: Float32Array.from(down.px) });
      if (c.mae > MAX_MAE || c.pctOver32 > MAX_PCT_OVER_32) failures.push(key);
      const before = prev?.textures?.[key]?.mae;
      if (before !== undefined && c.mae > before + MAX_MAE_RISE) rises.push(`${key} ${before} -> ${c.mae}`);
    }
    // PNGs of keys that aren't baked any more
    if (typeof opt("keys") !== "string") {
      for (const f of readdirSync(OUT_DIR)) if (f.endsWith(".png") && !textures[f.slice(0, -4)]) {
        unlinkSync(join(OUT_DIR, f));
        changed = true;
      }
    }
    const sorted = Object.fromEntries(Object.keys(textures).sort().map((k) => [k, textures[k]]));
    const sameEntries = prev && JSON.stringify(prev.textures) === JSON.stringify(sorted);
    const manifest = {
      version: 1,
      generated: changed || !sameEntries || !prev ? new Date().toISOString() : prev.generated,
      tool: "scripts/bake-art.mjs",
      chrome: page.version,
      scale: SCALE,
      sourceHash: sourceHash(),
      textures: sorted,
    };
    // one texture per line keeps diffs readable
    const body = Object.entries(sorted).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
    const head = JSON.stringify({ ...manifest, textures: undefined }, null, 2).replace(/\n}$/, "");
    writeFileSync(MANIFEST, `${head},\n  "textures": {\n${body}\n  }\n}\n`);

    // ---- report
    const total = Object.values(sorted).reduce((a, t) => a + t.bytes, 0);
    console.log(`bake-art: ${keys.length} textures at ${SCALE}x -> public/art (${(total / 1048576).toFixed(2)} MB in ${Object.keys(sorted).length} files)${changed ? "" : ", no file changed"}`);
    console.log("worst MAE (premultiplied 0-255, covered pixels) vs the 1x render:");
    for (const r of [...rows].sort((a, b) => b.mae - a.mae).slice(0, 10))
      console.log(`  ${r.key.padEnd(18)} MAE ${r.mae.toFixed(2).padStart(5)}  >8: ${String(r.pctOver8).padStart(5)}%  >32: ${String(r.pctOver32).padStart(4)}%  ${(r.bytes / 1024).toFixed(0).padStart(4)} KB`);
    if (opt("sheet")) {
      const pick = [...rows].sort((a, b) => b.mae - a.mae).slice(0, 12);
      const out = join(tmpdir(), "bake-art-sheet.png");
      writeFileSync(out, contactSheet(pick));
      console.log(`contact sheet (live 1x | bake->1x | bake ${SCALE}x | |diff|x4), worst 12: ${out}`);
    }
    if (failures.length) {
      console.log(`FAIL: ${failures.join(", ")} exceed MAE ${MAX_MAE} or ${MAX_PCT_OVER_32}% of pixels off by > 32.`);
      console.log("A pixel constant in make()/paperize() probably isn't multiplied by k (see src/game/art-pipeline.ts).");
      process.exitCode = 1;
    }
    if (rises.length) {
      console.log(`MAE up by more than ${MAX_MAE_RISE} since the previous bake: ${rises.join("; ")}`);
      if (opt("accept")) console.log("accepted (--accept).");
      else {
        console.log("If the art changed on purpose, check `npm run bake-art -- --sheet` and re-run with `-- --accept`.");
        process.exitCode = 1;
      }
    }
  } finally {
    await page.close();
  }
}

main().catch((err) => {
  console.error(`bake-art: ${err.message}`);
  process.exit(err.code ?? 1);
});
