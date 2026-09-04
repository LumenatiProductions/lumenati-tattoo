// Pocket arcade cabinet: on touch devices the game window takes over the
// viewport (page scroll locked, close button keeps working), the canvas
// scales to fill, and games that need a fire key get big drawn cabinet
// buttons in the bottom corners that send real key events. Desktop and the
// headless smoke harness never reach past the first guard, so nothing about
// the keyboard game changes. Loaded by the room template (where the window
// hosts the selector screen), the /arcade previews, and the ?embed=1
// cartridges the selector swaps into an iframe.
(function () {
  var isTouch =
    "ontouchstart" in window ||
    (window.matchMedia && matchMedia("(pointer: coarse)").matches) ||
    /[?&]touch=1/.test(location.search); // desktop demo / test hook

  // Desktop: the screen fills the viewport (fit to height, 5:4) instead of a
  // fixed 600px window. Cartridges size themselves to their iframe, and the
  // room's selector iframe rides this canvas's box, so one fit covers both.
  if (!isTouch && !window.__ARCADE_EMBED__) {
    var deskCanvas = document.getElementById("jd-skate-canvas");
    if (deskCanvas) {
      var deskFit = function () {
        var w = Math.min(window.innerWidth * 0.94, (window.innerHeight - 170) * 1.25);
        w = Math.max(600, Math.floor(w));
        deskCanvas.style.width = w + "px";
        deskCanvas.style.height = Math.floor(w * 0.8) + "px";
        deskCanvas.style.maxWidth = "100%";
      };
      deskFit();
      window.addEventListener("resize", deskFit);
    }
  }
  if (!isTouch) return;

  var canvas = document.getElementById("jd-skate-canvas");
  var overlay = document.getElementById("jd-game-overlay");
  if (!canvas || !overlay) return;
  var pad = canvas.parentElement; // the bezel around the canvas
  var box = pad && pad.parentElement; // the win95 window: titlebar + pad + status bar
  if (!pad || !box) return;

  function sendKey(type) {
    try {
      document.dispatchEvent(
        new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true })
      );
    } catch (e) {}
  }

  function makeFireBtn(side) {
    var b = document.createElement("div");
    b.textContent = "FIRE";
    b.style.cssText =
      "position:absolute;bottom:18px;" + side + ":18px;width:84px;height:84px;" +
      "border-radius:50%;display:flex;align-items:center;justify-content:center;" +
      "font-family:Tahoma,sans-serif;font-size:13px;font-weight:bold;color:#fff;" +
      "letter-spacing:1px;text-shadow:0 1px 0 rgba(0,0,0,0.5);" +
      "background:radial-gradient(circle at 35% 30%, #ff5fb0 0%, #FF1493 45%, #a10060 100%);" +
      "border:3px solid #3a3a3a;box-shadow:0 5px 0 #222, 0 8px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.35);" +
      "z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;";
    var repeatTimer = null;
    b.addEventListener(
      "touchstart",
      function (e) {
        e.preventDefault();
        b.style.transform = "translateY(3px)";
        b.style.boxShadow = "0 2px 0 #222, 0 4px 8px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.35)";
        sendKey("keydown");
        repeatTimer = setInterval(function () { sendKey("keydown"); }, 140);
      },
      { passive: false }
    );
    var up = function (e) {
      if (e) e.preventDefault();
      b.style.transform = "";
      b.style.boxShadow = "0 5px 0 #222, 0 8px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.35)";
      if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
      sendKey("keyup");
    };
    b.addEventListener("touchend", up, { passive: false });
    b.addEventListener("touchcancel", up, { passive: false });
    return b;
  }

  // ── Cartridge mode: this page is a game embed inside the selector's iframe.
  // The iframe already fills the cabinet, so no takeover — just the deck.
  var embedId = window.__ARCADE_EMBED__ || null;
  if (embedId) {
    if (embedId === "shooter" || embedId === "bricks") {
      pad.appendChild(makeFireBtn("left"));
      pad.appendChild(makeFireBtn("right"));
    }
    document.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
    return;
  }

  var titlebar = box.firstElementChild;
  // In the room the overlay is a fixed backdrop AROUND the window; in the
  // /arcade preview the overlay id sits ON the bezel itself.
  var isRoom = overlay !== pad;

  // Standalone previews still carry one game whose fire key has no touch
  // equivalent; the room window hosts the selector and never needs FIRE.
  var title = titlebar ? titlebar.textContent || "" : "";
  var wantsFire = /sterile\.exe|flashbreak\.exe/.test(title);

  var saved = null; // style snapshots while the cabinet is live
  var deckBtns = [];
  var closeBtn = null;

  // Size the canvas element to the exact drawn rect. Never object-fit: the
  // games (and the selector) map taps over the element box, and letterbox
  // bars inside the element would skew every touch.
  function fit() {
    // -20 leaves room for the bezel shadow so it never bleeds off the pad.
    var s = Math.min((pad.clientWidth - 20) / 400, (pad.clientHeight - 20) / 320);
    if (!isFinite(s) || s <= 0) return;
    canvas.style.width = Math.max(1, Math.floor(400 * s)) + "px";
    canvas.style.height = Math.max(1, Math.floor(320 * s)) + "px";
  }

  // Real fullscreen where the browser allows it (Android Chrome, iPad), and a
  // landscape lock on top so the 5:4 screen gets the most glass. iPhone Safari
  // has no fullscreen for pages, so there the takeover below is the ceiling.
  function goFull() {
    try {
      var el = document.documentElement;
      var rq = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!rq) return;
      var p = rq.call(el, { navigationUI: "hide" });
      if (p && p.then) p.then(function () {
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(function () {}); } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }
  function leaveFull() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        var ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) ex.call(document);
      }
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    } catch (e) {}
  }

  function lockScroll(on) {
    document.documentElement.style.overflow = on ? "hidden" : "";
    document.body.style.overflow = on ? "hidden" : "";
  }

  function blockPan(e) {
    // Keep the page pinned; the games call preventDefault on the canvas
    // themselves, this catches the bezel and empty deck space.
    e.preventDefault();
  }

  function enterCabinet() {
    if (saved) return;
    goFull();
    saved = {
      box: box.style.cssText,
      pad: pad.style.cssText,
      canvas: canvas.style.cssText,
      overlayZ: overlay.style.zIndex,
    };
    lockScroll(true);
    // In the room the box sits inside the fixed overlay backdrop (z 99999),
    // so the overlay itself must clear Winamp + Clippy (999999). Only the
    // z-index is touched — the ✕ drives display, and restoring the whole
    // style here would fight it.
    if (isRoom) overlay.style.zIndex = "1000000";
    box.style.position = "fixed";
    box.style.left = "0";
    box.style.top = "0";
    box.style.width = "100vw";
    box.style.height = "100vh";
    try { if (CSS.supports("height", "100dvh")) box.style.height = "100dvh"; } catch (e) {}
    box.style.maxWidth = "none";
    box.style.margin = "0";
    box.style.zIndex = "1000000"; // above the site's Winamp + Clippy (999999)
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.boxShadow = "none";
    pad.style.flex = "1";
    pad.style.minHeight = "0";
    pad.style.display = "flex";
    pad.style.alignItems = "center";
    pad.style.justifyContent = "center";
    pad.style.position = "relative";
    // Old-cabinet woodgrain around the screen, with a black bezel between.
    // The bezel is a box-shadow on purpose: a CSS border would grow the
    // canvas rect the games map their taps over.
    pad.style.backgroundColor = "#5a3a22";
    pad.style.backgroundImage =
      "repeating-linear-gradient(90deg, rgba(255,220,170,0.05) 0 1px, transparent 1px 6px)," +
      "repeating-linear-gradient(88deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 11px)," +
      "repeating-linear-gradient(92deg, rgba(0,0,0,0.10) 0 3px, transparent 3px 23px)," +
      "linear-gradient(90deg, #6b4527 0%, #55331b 30%, #6b4527 55%, #4c2e18 80%, #61401f 100%)";
    canvas.style.boxShadow = "0 0 0 8px #0c0c0c, 0 0 30px rgba(0,0,0,0.65)";
    canvas.style.maxWidth = "none";
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    box.addEventListener("touchmove", blockPan, { passive: false });

    if (wantsFire) {
      deckBtns = [makeFireBtn("left"), makeFireBtn("right")];
      for (var i = 0; i < deckBtns.length; i++) pad.appendChild(deckBtns[i]);
    }
    if (!isRoom && titlebar && !closeBtn) {
      // The preview titlebar has no ✕ — give the takeover a way back out.
      closeBtn = document.createElement("span");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText =
        "font-family:Tahoma,sans-serif;font-size:13px;color:#fff;padding:2px 10px;cursor:pointer;";
      closeBtn.addEventListener(
        "touchstart",
        function (e) { e.preventDefault(); e.stopPropagation(); exitCabinet(); },
        { passive: false }
      );
      titlebar.appendChild(closeBtn);
    }
  }

  function exitCabinet() {
    if (!saved) return;
    leaveFull();
    box.style.cssText = saved.box;
    pad.style.cssText = saved.pad;
    canvas.style.cssText = saved.canvas;
    if (isRoom) overlay.style.zIndex = saved.overlayZ;
    saved = null;
    lockScroll(false);
    window.removeEventListener("resize", fit);
    box.removeEventListener("touchmove", blockPan);
    for (var i = 0; i < deckBtns.length; i++) {
      if (deckBtns[i].parentNode) deckBtns[i].parentNode.removeChild(deckBtns[i]);
    }
    deckBtns = [];
    if (closeBtn && closeBtn.parentNode) closeBtn.parentNode.removeChild(closeBtn);
    closeBtn = null;
  }

  if (isRoom) {
    // The room's Games icon already opens a fixed overlay; ride its
    // open/close (the ✕ sets display:none, which exits the cabinet too).
    var obs = new MutationObserver(function () {
      if (overlay.style.display === "flex") enterCabinet();
      else exitCabinet();
    });
    obs.observe(overlay, { attributes: true, attributeFilter: ["style"] });
    if (overlay.style.display === "flex") enterCabinet();
  } else {
    // The preview window sits inline on the page; the first tap on it takes
    // over the viewport.
    box.addEventListener(
      "touchstart",
      function () { enterCabinet(); },
      { passive: true }
    );
  }
})();
