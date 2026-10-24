/*
 * Playtest bot (dev only). Open http://localhost:3000/play, paste this into
 * the browser console. It starts a keyboard game, walks, fights with the note
 * keys (slashes, fireballs, the super when magic is full), picks the demo
 * song and parries every orb on time. Progress: window.__bot.
 * Stop: clearInterval(window.__botTimer); clearInterval(window.__resumeTimer)
 */
(() => {
  window.__errs = [];
  window.addEventListener("error", (e) => window.__errs.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));
  [...document.querySelectorAll("button")].find((b) => b.textContent.includes("keyboard"))?.click();
  if (window.__botTimer) clearInterval(window.__botTimer);
  if (window.__resumeTimer) clearInterval(window.__resumeTimer);
  const KC = { KeyA: 65, KeyD: 68, KeyZ: 90, KeyX: 88, KeyC: 67, KeyV: 86, KeyB: 66 };
  const send = (type, code) => {
    const e = new KeyboardEvent(type, { code, key: code, bubbles: true });
    Object.defineProperty(e, "keyCode", { get: () => KC[code] });
    Object.defineProperty(e, "which", { get: () => KC[code] });
    window.dispatchEvent(e);
  };
  const press = (code) => {
    send("keydown", code);
    setTimeout(() => send("keyup", code), 40);
  };
  const NOTE_KEY = { E: "KeyZ", G: "KeyX", A: "KeyC", B: "KeyV", D: "KeyB" };
  let held = null;
  const hold = (code) => {
    if (held === code) return;
    if (held) send("keyup", held);
    held = code;
    if (code) send("keydown", code);
  };
  const bot = (window.__bot = { started: performance.now(), log: [], queue: [], lastNoteAt: 0, parried: new Set(), seq: 0, fps: [], pauses: 0, minHp: 100 });
  const log = (m) => bot.log.push(`${((performance.now() - bot.started) / 1000).toFixed(1)}s ${m}`);
  let lastScene = "";
  let lastFpsAt = 0;
  window.__resumeTimer = setInterval(() => {
    const r = [...document.querySelectorAll(".pause button")].find((b) => b.textContent.trim() === "Resume");
    if (r && !document.hidden) {
      r.click();
      bot.pauses++;
    }
  }, 300);
  window.__botTimer = setInterval(() => {
    const game = window.__game;
    if (!game) return;
    const key = game.scene.getScenes(true).map((s) => s.scene.key)[0];
    if (key && key !== lastScene) {
      log(`scene ${key}`);
      lastScene = key;
    }
    const now = performance.now();
    if (now - lastFpsAt > 1000) {
      lastFpsAt = now;
      bot.fps.push(Math.round(game.loop.actualFps));
    }
    if (key !== "Boss" && key !== "Level1") return hold(null);
    const sc = game.scene.getScene(key);
    const h = sc.hero;
    if (!h) return;
    bot.hp = Math.round(h.hp);
    bot.minHp = Math.min(bot.minHp, bot.hp);
    bot.magic = Math.round(h.magic);
    if (key === "Boss") {
      const pick = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Wolf's Waltz"));
      if (pick) {
        pick.click();
        log("picked the demo song");
        return;
      }
      for (const o of sc.orbs || []) {
        if (o.resolved || bot.parried.has(o.key)) continue;
        if (Math.abs(now - o.hitPerf) < 25) {
          bot.parried.add(o.key);
          press(NOTE_KEY[o.attack.pc]);
          bot.lastNoteAt = now;
        }
      }
      bot.wolfHp = sc.wolf && Math.round(sc.wolf.hp);
    }
    const targets = (sc.enemies || []).filter((e) => e.alive).map((e) => ({ x: e.x }));
    if (key === "Boss" && sc.wolf?.alive && sc.started && sc.currentPhase(sc.songNow().local).phase.kind !== "parry") targets.push({ x: sc.wolf.x });
    if (targets.length) {
      const t = targets.sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
      const dx = t.x - h.x;
      hold(Math.abs(dx) > 130 ? (dx > 0 ? "KeyD" : "KeyA") : null);
      if (Math.abs(dx) < 300 && now - bot.lastNoteAt > 230) {
        if (!bot.queue.length) {
          bot.seq++;
          bot.queue = h.magic >= 100 ? ["E", "G", "A", "B", "D", "E"] : bot.seq % 3 === 0 ? ["E", "G"] : ["E", "A"];
        }
        press(NOTE_KEY[bot.queue.shift()]);
        bot.lastNoteAt = now;
      }
    } else if (key === "Level1") {
      hold("KeyD");
      bot.queue = [];
    } else hold(null);
  }, 40);
  return "bot running";
})();
