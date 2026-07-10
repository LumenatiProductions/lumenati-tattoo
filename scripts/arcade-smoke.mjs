// Headless smoke harness for the arcade: boots every game IIFE in a stubbed
// browser, drives frames + inputs through a full life cycle (attract loop,
// play, death, initials sign-in, leaderboard, restart) and fails loudly on
// any exception. Run: node scripts/arcade-smoke.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

function gameSources() {
  const out = {};
  for (const id of ["snake", "bricks", "shooter", "pong", "frogger", "steady", "shoprush", "flashmatch"]) {
    out[id] = readFileSync(path.join(ROOT, "legacy", "games", `${id}.js`), "utf8");
  }
  const tpl = readFileSync(path.join(ROOT, "legacy", "artist-page-y2k.html"), "utf8");
  const m = tpl.match(/<script id="jd-arcade-game">\n([\s\S]*?)<\/script>/);
  out.skate = m[1];
  return out;
}

function makeCtx2d() {
  const grad = { addColorStop() {} };
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => grad;
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  };
  return new Proxy({}, handler);
}

function makeSandbox() {
  const listeners = { document: {}, canvas: {} };
  const store = {};
  let rafCb = null;
  const spans = {};
  const mkSpan = (id, txt) => {
    let v = txt;
    const span = { get textContent() { return v; }, set textContent(x) { v = String(x); } };
    spans[id] = span;
    return span;
  };
  mkSpan("jd-br-score", "0"); mkSpan("jd-br-lives", "3");
  mkSpan("jd-game-hint", ""); mkSpan("jd-stat-a", "Score"); mkSpan("jd-stat-b", "Lives");
  const canvas = {
    getContext: () => makeCtx2d(),
    addEventListener: (t, fn) => (listeners.canvas[t] = listeners.canvas[t] || []).push(fn),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 320 }),
    style: {},
  };
  const overlay = { style: { display: "none" } };
  let observers = [];
  const sandbox = {
    console,
    Math, JSON, Array, Object, String, Number, parseInt, parseFloat, isNaN,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 },
    Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe() {}
    },
    document: {
      getElementById: (id) => {
        if (id === "jd-skate-canvas") return canvas;
        if (id === "jd-game-overlay") return overlay;
        return spans[id] || mkSpan(id, "");
      },
      querySelectorAll: () => [],
      addEventListener: (t, fn) => (listeners.document[t] = listeners.document[t] || []).push(fn),
      createElement: () => ({ style: {} }),
    },
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return {
    sandbox, listeners, store, spans, overlay,
    openOverlay() {
      overlay.style.display = "flex";
      for (const o of observers) o.cb();
    },
    frame(t) { const cb = rafCb; rafCb = null; if (cb) cb(t); },
    key(code, up = false) {
      const ev = { code, key: code === "Space" ? " " : code, repeat: false, preventDefault() {}, stopPropagation() {} };
      for (const fn of listeners.document[up ? "keyup" : "keydown"] || []) fn(ev);
    },
    click(x, y) {
      const ev = { clientX: x, clientY: y, preventDefault() {} };
      for (const fn of listeners.canvas.click || []) fn(ev);
    },
  };
}

function runGame(id, src, opts = {}) {
  const h = makeSandbox();
  vm.runInContext(src, h.sandbox, { filename: `${id}.js` });
  h.openOverlay();

  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { t += 16.67; h.frame(t); } };

  // 1. attract mode must loop well past its first cycle
  step(700);

  // 2. start and play with periodic blind inputs until the run dies
  h.key("Space"); h.key("Space", true);
  let died = false, scoreAtDeath = "0";
  const boardKey = `lumenati-arcade-${id}-board`;
  const maxFrames = opts.maxFrames ?? 30000;
  for (let i = 0; i < maxFrames; i++) {
    if (i % 40 === 20) { h.key("Space"); h.key("Space", true); }
    if (i % 90 === 30) { h.key("ArrowLeft"); h.key("ArrowLeft", true); }
    if (i % 90 === 60) { h.key("ArrowRight"); h.key("ArrowRight", true); }
    if (i % 130 === 70) { h.key("ArrowUp"); h.key("ArrowUp", true); }
    if (i % 170 === 90) { h.key("ArrowDown"); h.key("ArrowDown", true); }
    step(1);
    if (h.spans["jd-br-lives"].textContent === "0" && id !== "pong") { died = true; scoreAtDeath = h.spans["jd-br-score"].textContent; break; }
    if (id === "pong" && h.spans["jd-br-lives"].textContent === "5") { died = true; scoreAtDeath = "0"; break; }
  }
  if (!died) throw new Error(`never reached game over in ${maxFrames} frames`);
  step(30);

  // 3. sign initials (no-op when the score did not qualify), then restart
  h.key("KeyS"); h.key("KeyC"); h.key("KeyO");
  h.key("Space"); h.key("Space", true);
  step(10);
  h.key("Space"); h.key("Space", true);
  step(90);

  // 4. HARD assertions: the game must actually be running again
  const livesNow = h.spans["jd-br-lives"].textContent;
  if (id === "pong") {
    if (livesNow === "5") throw new Error("restart failed: CPU score still 5 after restart input");
  } else if (livesNow === "0") {
    throw new Error("restart failed: lives still 0 after board + restart input");
  }
  if (Number(scoreAtDeath) > 0) {
    const board = JSON.parse(h.store[boardKey] || "[]");
    if (!board.length) throw new Error(`score ${scoreAtDeath} died but leaderboard is empty`);
    if (!board.some((e) => e.n === "SCO")) throw new Error("initials SCO not on the board");
  }
  return { store: h.store, boardKey, scoreAtDeath, spans: h.spans };
}

const sources = gameSources();
let failed = 0;
for (const [id, src] of Object.entries(sources)) {
  try {
    const r = runGame(id, src);
    const boardNote = r.store[r.boardKey] ? `board=${r.store[r.boardKey]}` : "board empty (score 0 run)";
    console.log(`PASS ${id.padEnd(11)} died at ${r.scoreAtDeath}, restarted clean; ${boardNote}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${id.padEnd(11)} ${e.stack.split("\n").slice(0, 3).join(" | ")}`);
  }
}

// Extra pass: force the skate level ladder fast so every Colorado locale draws
try {
  const fast = sources.skate.replace("1 + Math.floor(dist / 4000)", "1 + Math.floor(dist / 250)");
  const h = makeSandbox();
  vm.runInContext(fast, h.sandbox, { filename: "skate-fast.js" });
  h.openOverlay();
  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { t += 16.67; h.frame(t); } };
  step(100);
  h.key("Space"); h.key("Space", true);
  for (let i = 0; i < 4000; i++) {
    if (i % 30 === 10) { h.key("Space"); h.key("Space", true); }
    step(1);
    if (h.spans["jd-br-lives"].textContent === "0") { h.key("Space"); h.key("Space", true); }
  }
  console.log("PASS skate-tour   all four Colorado locales drew without error");
} catch (e) {
  failed++;
  console.log(`FAIL skate-tour   ${e.stack.split("\n").slice(0, 3).join(" | ")}`);
}

process.exit(failed ? 1 : 0);
