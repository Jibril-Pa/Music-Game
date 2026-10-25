/*
 * Playtest bot (dev only). Open http://localhost:3000/play (add ?unlock to
 * pick any level), paste this into the browser console. It starts a keyboard
 * game (chords mode) at the selected level, then plays the chord over the
 * nearest foe / projectile / howl / wolf, heals with the fairy, casts the
 * super when the meter is full, picks the built-in boss song, and walks
 * through the portal to the next world. Progress: window.__bot.
 *   window.__botSpeed = 450  // ms between plays (default 300; a beginner is ~600)
 *   window.__botMiss = 0.2   // chance to play the wrong chord
 *   window.__botStopAfter = "2-3"  // stop after this level (default: play on)
 * Stop: clearInterval(window.__botTimer); clearInterval(window.__resumeTimer)
 */
(() => {
  window.__errs = [];
  window.addEventListener("error", (e) => window.__errs.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));
  [...document.querySelectorAll("button")].find((b) => b.textContent.includes("keyboard"))?.click();
  if (window.__botTimer) clearInterval(window.__botTimer);
  if (window.__resumeTimer) clearInterval(window.__resumeTimer);
  const CHORD_KEY = { Em: "Digit1", G: "Digit2", C: "Digit3", D: "Digit4", A: "Digit5", Am: "Digit6", E: "Digit7" };
  const NOTE_KEY = { E: "KeyZ", G: "KeyX", A: "KeyC", B: "KeyV", D: "KeyB", C: "KeyN" };
  const press = (code) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code, bubbles: true })), 40);
  };
  const bot = (window.__bot = { started: performance.now(), log: [], lastAt: 0, parried: new Set(), fps: [], pauses: 0, minHp: 100, plays: 0, wrong: 0, levels: [] });
  const log = (m) => bot.log.push(`${((performance.now() - bot.started) / 1000).toFixed(1)}s ${m}`);
  let lastKey = "";
  let lastFpsAt = 0;
  let levelStart = performance.now();
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
    const sc0 = key && game.scene.getScene(key);
    const id = sc0?.level?.id ?? (key === "Boss" ? "boss" : "");
    const now = performance.now();
    if (`${key}:${id}` !== lastKey) {
      if (lastKey) bot.levels.push({ was: lastKey, secs: Math.round((now - levelStart) / 1000), minHp: bot.minHp });
      log(`scene ${key} ${id} hp=${bot.hp}`);
      lastKey = `${key}:${id}`;
      levelStart = now;
      bot.minHp = 100;
    }
    if (now - lastFpsAt > 1000) {
      lastFpsAt = now;
      bot.fps.push(Math.round(game.loop.actualFps));
    }
    if (key === "End") {
      const go = [...document.querySelectorAll(".end-panel button")].find((b) => b.textContent.includes("portal"));
      const stop = window.__botStopAfter && bot.log.some((l) => l.includes(window.__botStopAfter));
      if (go && !stop && !bot.clickedAt) {
        bot.clickedAt = now;
        setTimeout(() => {
          go.click();
          bot.clickedAt = 0;
        }, 1500);
      }
      return;
    }
    if (key !== "Boss" && key !== "Journey") return;
    const sc = sc0;
    const h = sc.hero;
    if (!h) return;
    bot.hp = Math.round(h.hp);
    bot.minHp = Math.min(bot.minHp, bot.hp);
    const chords = sc.symbols.enemy.includes("Em");
    const keyOf = (sym) => (chords ? CHORD_KEY : NOTE_KEY)[sym];
    const play = (sym) => {
      let s = sym;
      if (Math.random() < (window.__botMiss ?? 0)) {
        const pool = sc.symbols.enemy.filter((x) => x !== sym);
        s = pool[Math.floor(Math.random() * pool.length)];
        bot.wrong++;
      }
      press(keyOf(s));
      bot.plays++;
      bot.lastAt = now;
    };
    if (key === "Boss") {
      const pick = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("built-in demo"));
      if (pick) {
        pick.click();
        log("picked the demo song");
        return;
      }
      for (const o of sc.orbs || []) {
        if (o.resolved || bot.parried.has(o.key)) continue;
        if (Math.abs(now - o.hitPerf) < 25) {
          bot.parried.add(o.key);
          return play(o.attack.symbol);
        }
      }
      bot.wolfHp = sc.wolf && Math.round(sc.wolf.hp);
    }
    if (now - bot.lastAt < (window.__botSpeed ?? 300)) return;
    if (h.magic >= 100) return play(sc.symbols.super);
    if (sc.fairy && h.hp < 85) return play(sc.symbols.heal);
    const view = sc.cameras.main.worldView;
    const targets = [];
    for (const e of sc.enemies) if (e.alive && e.next && e.x < view.right - 10) targets.push({ x: e.x, sym: e.next });
    for (const c of sc.candies || []) if (!c.done) targets.push({ x: c.img.x, sym: c.symbol });
    for (const g of sc.gusts || []) if (!g.done) targets.push({ x: g.img.x, sym: g.symbol });
    if (key === "Boss" && sc.wolfSymbol && sc.phaseKind === "free") targets.push({ x: sc.wolf.x, sym: sc.wolfSymbol });
    if (!targets.length) return;
    targets.sort((a, b) => a.x - b.x);
    play(targets[0].sym);
  }, 40);
  return "bot running";
})();
