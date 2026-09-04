// The Lumenati cabinet's game-select screen. Every room's Games window boots
// into this instead of a single game: an attract screen listing the whole
// catalog, drawn like an old multicade menu. Picking a title swaps in a
// cartridge — an /arcade/<id>?embed=1 iframe — so exactly one game IIFE is
// ever alive, and a GAMES button in the titlebar comes back here. The room
// renderer injects __ARCADE_GAMES__ / __ARCADE_ARTIST__ / __ARCADE_ACCENT__.
(function () {
  var canvas = document.getElementById("jd-skate-canvas");
  var overlay = document.getElementById("jd-game-overlay");
  if (!canvas || !overlay) return;
  var GAMES = window.__ARCADE_GAMES__ || [];
  if (!GAMES.length) return;
  var ctx = canvas.getContext("2d");
  var W = 400, H = 320;
  var pad = canvas.parentElement;
  var box = pad.parentElement;
  var titlebar = box.firstElementChild;
  var statusEl = pad.nextElementSibling;
  var hintEl = document.getElementById("jd-game-hint");
  var ARTIST = window.__ARCADE_ARTIST__ || "";
  var ACCENT = window.__ARCADE_ACCENT__ || "#FF1493";
  var IS_TOUCH = "ontouchstart" in window;
  var FORCE_TOUCH = /[?&]touch=1/.test(location.search);

  // SFX — same tiny WebAudio pattern as the games; rooms work fine muted.
  var sfxCtx;
  function playSfx(freq, dur, type, vol) {
    try {
      if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (sfxCtx.state === "suspended") { try { sfxCtx.resume(); } catch (e) {} }
      var o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, sfxCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, sfxCtx.currentTime + dur);
      o.connect(g); g.connect(sfxCtx.destination);
      o.start(); o.stop(sfxCtx.currentTime + dur);
    } catch (e) {}
  }
  function sfxMove() { playSfx(660, 0.05, "square", 0.08); }
  function sfxCoin() { playSfx(988, 0.07, "square", 0.11); setTimeout(function () { playSfx(1319, 0.18, "square", 0.11); }, 70); }

  // Screenshots of each game, drawn beside the list so you know what you're
  // picking. /arcade/thumbs/<id>.jpg, captured from the real cartridges.
  var THUMBS = {};
  GAMES.forEach(function (g) {
    var im = new Image();
    im.src = "/arcade/thumbs/" + g.id + ".png";
    THUMBS[g.id] = im;
  });

  // The wall's one-liners: top score + plays per game, for the preview panel.
  var WALL = {};
  function fmtScore(id, s) {
    var n = String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (id === "shoprush") return "$" + n;
    return n;
  }
  function loadWall() {
    try {
      var q = "all=1" + (ARTIST ? "&artist=" + encodeURIComponent(ARTIST) : "");
      fetch("/api/arcade/scores?" + q, { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.games) WALL = j.games; })
        .catch(function () {});
    } catch (e) {}
  }
  var DEVICE = window.__ARCADE_DEVICE__ || "";

  var mode = "menu"; // menu | playing
  var sel = 0, frame = 0, rafId = null;
  var iframe = null, menuBtn = null;

  // Star drift behind the list — cheap attract-mode motion.
  var stars = [];
  for (var i = 0; i < 36; i++) stars.push({ x: (i * 61) % W, y: (i * 37) % H, s: (i % 3) + 1 });

  var ROW_Y0 = 92, ROW_H = 20, LIST_X = 18, LIST_W = 196;
  var PV_X = 226, PV_Y = 84, PV_W = 156, PV_H = 125;

  function draw() {
    frame++;
    ctx.fillStyle = "#060310";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.x -= st.s * 0.15;
      if (st.x < 0) st.x = W;
      ctx.fillRect(st.x | 0, st.y, 1, 1);
    }

    // Marquee
    ctx.textAlign = "center";
    ctx.font = "16px 'Press Start 2P', monospace";
    ctx.fillStyle = ACCENT;
    ctx.fillText("LUMENATI", W / 2, 40);
    ctx.fillStyle = "#fff";
    ctx.fillText("A R C A D E", W / 2, 64);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(40, 74, W - 80, 1);

    // Game list
    for (var r = 0; r < GAMES.length; r++) {
      var y = ROW_Y0 + r * ROW_H;
      var on = r === sel;
      if (on) {
        ctx.fillStyle = ACCENT;
        ctx.globalAlpha = 0.28 + 0.1 * Math.sin(frame * 0.15);
        ctx.fillRect(LIST_X - 8, y - 13, LIST_W, 18);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = "left";
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.62)";
      if (on && frame % 32 < 24) ctx.fillText(">", LIST_X - 2, y);
      ctx.fillText(GAMES[r].label.toUpperCase(), LIST_X + 12, y);
    }

    // Preview panel: the selected game's screenshot in a CRT-ish bezel.
    var g = GAMES[sel];
    ctx.fillStyle = "#000";
    ctx.fillRect(PV_X - 4, PV_Y - 4, PV_W + 8, PV_H + 8);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(PV_X - 4, PV_Y - 4, PV_W + 8, PV_H + 8);
    var im = THUMBS[g.id];
    if (im && im.complete && im.naturalWidth) {
      ctx.drawImage(im, PV_X, PV_Y, PV_W, PV_H);
    } else {
      ctx.fillStyle = "#0b0718";
      ctx.fillRect(PV_X, PV_Y, PV_W, PV_H);
      ctx.textAlign = "center";
      ctx.font = "7px 'Press Start 2P', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText("NO SIGNAL", PV_X + PV_W / 2, PV_Y + PV_H / 2 + 3);
    }
    // Scanlines over the preview only, so it reads as a screen.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (var py = PV_Y; py < PV_Y + PV_H; py += 3) ctx.fillRect(PV_X, py, PV_W, 1);
    ctx.textAlign = "center";
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.fillStyle = ACCENT;
    ctx.fillText(g.exe, PV_X + PV_W / 2, PV_Y + PV_H + 18);
    // The wall's top run for this game, plus how many have tried.
    var wg = WALL[g.id];
    ctx.font = "6px 'Press Start 2P', monospace";
    if (wg && wg.top) {
      ctx.fillStyle = "#FFD700";
      ctx.fillText("WALL " + wg.top.n + " " + fmtScore(g.id, wg.top.s), PV_X + PV_W / 2, PV_Y + PV_H + 32);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(wg.plays + " PLAYS" + (wg.playsToday ? " // " + wg.playsToday + " TODAY" : ""), PV_X + PV_W / 2, PV_Y + PV_H + 44);
    } else if (wg) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText("WALL IS EMPTY. BE FIRST", PV_X + PV_W / 2, PV_Y + PV_H + 32);
    }

    // Footer
    ctx.textAlign = "center";
    ctx.font = "8px 'Press Start 2P', monospace";
    if (frame % 70 < 48) {
      ctx.fillStyle = "#FFD700";
      ctx.fillText("INSERT COIN", W / 2, 292);
    }
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.fillText(IS_TOUCH ? "TAP A GAME TO PLAY" : "↑↓ SELECT // ENTER TO PLAY", W / 2, 310);
    ctx.textAlign = "left";

    // Scanlines
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
  }

  function loop() {
    if (mode !== "menu" || overlay.style.display !== "flex") { rafId = null; return; }
    draw();
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }

  function setHint(t) { if (hintEl) hintEl.textContent = t; }

  function launch(g) {
    if (mode === "playing") return;
    mode = "playing";
    sfxCoin();
    canvas.style.visibility = "hidden";
    if (statusEl) statusEl.style.display = "none";
    pad.style.position = "relative";
    iframe = document.createElement("iframe");
    var q = [];
    if (ARTIST) q.push("artist=" + encodeURIComponent(ARTIST));
    if (DEVICE) q.push("device=" + encodeURIComponent(DEVICE));
    if (FORCE_TOUCH) q.push("touch=1");
    iframe.src = "/arcade-embed/" + g.id + (q.length ? "?" + q.join("&") : "");
    iframe.setAttribute("title", g.label);
    iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;";
    iframe.addEventListener("load", function () { try { iframe.contentWindow.focus(); } catch (e) {} });
    pad.appendChild(iframe);
    if (!menuBtn && titlebar) {
      menuBtn = document.createElement("span");
      menuBtn.textContent = "◂ GAMES";
      menuBtn.style.cssText = "font-family:Tahoma,sans-serif;font-size:11px;font-weight:bold;color:#fff;cursor:pointer;padding:0 10px;user-select:none;-webkit-user-select:none;";
      var back = function (e) { if (e) e.preventDefault(); menu(); };
      menuBtn.addEventListener("click", back);
      menuBtn.addEventListener("touchstart", back, { passive: false });
      titlebar.insertBefore(menuBtn, titlebar.lastElementChild);
    }
  }

  function menu() {
    if (iframe) { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); iframe = null; }
    if (menuBtn) { if (menuBtn.parentNode) menuBtn.parentNode.removeChild(menuBtn); menuBtn = null; }
    canvas.style.visibility = "";
    if (statusEl) statusEl.style.display = "";
    setHint(GAMES.length + " games // INSERT COIN");
    if (mode !== "menu") { mode = "menu"; loadWall(); startLoop(); }
  }

  // Keyboard: only while the cabinet is open and showing the menu.
  document.addEventListener("keydown", function (e) {
    if (overlay.style.display !== "flex") return;
    if (mode !== "menu") { if (e.code === "Escape") menu(); return; }
    if (e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); sel = (sel + GAMES.length - 1) % GAMES.length; sfxMove(); }
    else if (e.code === "ArrowDown" || e.code === "KeyS") { e.preventDefault(); sel = (sel + 1) % GAMES.length; sfxMove(); }
    else if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); launch(GAMES[sel]); }
  });

  function rowAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var y = (clientY - r.top) * (H / r.height);
    var idx = Math.floor((y - (ROW_Y0 - 13)) / ROW_H);
    return idx >= 0 && idx < GAMES.length ? idx : -1;
  }
  canvas.addEventListener("click", function (e) {
    if (mode !== "menu") return;
    var idx = rowAt(e.clientX, e.clientY);
    if (idx >= 0) { sel = idx; launch(GAMES[idx]); }
  });
  canvas.addEventListener("touchstart", function (e) {
    if (mode !== "menu") return;
    e.preventDefault();
    var idx = rowAt(e.touches[0].clientX, e.touches[0].clientY);
    if (idx >= 0) { sel = idx; launch(GAMES[idx]); }
  }, { passive: false });

  // Boot when the cabinet opens; closing it (the titlebar ✕) also ejects the
  // cartridge so the next open lands back on the menu, silent.
  var obs = new MutationObserver(function () {
    if (overlay.style.display === "flex") { setHint(GAMES.length + " games // INSERT COIN"); loadWall(); startLoop(); }
    else menu();
  });
  obs.observe(overlay, { attributes: true, attributeFilter: ["style"] });
  if (overlay.style.display === "flex") { loadWall(); startLoop(); }
})();
