// Pocket arcade cabinet: on touch devices the game window takes over the
// viewport (page scroll locked, close button keeps working), the canvas
// scales to fill, and games that need a fire key get big drawn cabinet
// buttons in the bottom corners that send real key events. Desktop and the
// headless smoke harness never reach past the first guard, so nothing about
// the keyboard game changes. Loaded by both the room template and the
// /arcade/<id> preview (same window markup).
(function () {
  var isTouch =
    "ontouchstart" in window ||
    (window.matchMedia && matchMedia("(pointer: coarse)").matches) ||
    /[?&]touch=1/.test(location.search); // desktop demo / test hook
  if (!isTouch) return;

  var canvas = document.getElementById("jd-skate-canvas");
  var overlay = document.getElementById("jd-game-overlay");
  if (!canvas || !overlay) return;
  var pad = canvas.parentElement; // the 4px bezel around the canvas
  var box = pad && pad.parentElement; // the win95 window: titlebar + pad + status bar
  if (!pad || !box) return;
  var titlebar = box.firstElementChild;
  // In the room the overlay is a fixed backdrop AROUND the window; in the
  // /arcade preview the overlay id sits ON the bezel itself.
  var isRoom = overlay !== pad;

  // Games whose keyboard fire key has no touch equivalent get FIRE buttons.
  // Identified by the exe name the renderer writes into the titlebar.
  var title = titlebar ? titlebar.textContent || "" : "";
  var wantsFire = /sterile\.exe|flashbreak\.exe/.test(title);

  var saved = null; // style snapshots while the cabinet is live
  var deckBtns = [];
  var closeBtn = null;

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
    saved = {
      box: box.style.cssText,
      pad: pad.style.cssText,
      canvas: canvas.style.cssText,
      overlayZ: overlay.style.zIndex,
    };
    // In the room the box sits inside the fixed overlay backdrop (z 99999),
    // so the overlay itself must clear Winamp + Clippy (999999). Only the
    // z-index is touched — the ✕ drives display, and restoring the whole
    // style here would fight it.
    if (isRoom) overlay.style.zIndex = "1000000";
    lockScroll(true);
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
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.maxWidth = "none";
    canvas.style.objectFit = "contain";
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
    box.style.cssText = saved.box;
    pad.style.cssText = saved.pad;
    canvas.style.cssText = saved.canvas;
    if (isRoom) overlay.style.zIndex = saved.overlayZ;
    saved = null;
    lockScroll(false);
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
