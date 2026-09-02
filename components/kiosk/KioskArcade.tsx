"use client";

import { useEffect, useRef } from "react";
import { GAME_CATALOG } from "@/lib/arcade/catalog";

// The kiosk's arcade: the same multicade cabinet the artist rooms open, on the
// front-desk iPad. Mounted ONCE in the kiosk layout and toggled with display
// (the selector script binds to these ids at load and watches the overlay's
// style attribute: flex = menu boots, none = cartridge ejects). Open it from
// anywhere with: window.dispatchEvent(new Event("lmn-arcade-open")).

declare global {
  interface Window {
    __ARCADE_GAMES__?: { id: string; label: string; exe: string }[];
    __ARCADE_ARTIST__?: string;
    __ARCADE_ACCENT__?: string;
  }
}

export const ARCADE_OPEN_EVENT = "lmn-arcade-open";

export default function KioskArcade() {
  const overlay = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.__ARCADE_GAMES__ = GAME_CATALOG.map((g) => ({ id: g.id, label: g.label, exe: g.exe }));
    window.__ARCADE_ARTIST__ = "";
    window.__ARCADE_ACCENT__ = "#FF1493";
    // Load the cabinet scripts once; they grab the canvas/overlay by id.
    for (const src of ["/arcade-selector.js", "/arcade-cabinet.js"]) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      const s = document.createElement("script");
      s.src = src;
      document.body.appendChild(s);
    }
    const open = () => {
      if (overlay.current) overlay.current.style.display = "flex";
    };
    window.addEventListener(ARCADE_OPEN_EVENT, open);
    return () => window.removeEventListener(ARCADE_OPEN_EVENT, open);
  }, []);

  const close = () => {
    if (overlay.current) overlay.current.style.display = "none";
  };

  return (
    <div
      id="jd-game-overlay"
      ref={overlay}
      style={{
        display: "none",
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.88)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#ece9d8",
          border: "2px solid",
          borderColor: "#fff #808080 #808080 #fff",
          boxShadow: "3px 3px 0 rgba(0,0,0,0.3)",
          maxWidth: "95vw",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "3px 4px",
            background: "linear-gradient(180deg,#FF1493 0%,#c8006e 100%)",
            height: 24,
          }}
        >
          <span style={{ fontFamily: "Tahoma,sans-serif", fontSize: 11, fontWeight: "bold", color: "#fff", textShadow: "1px 1px 0 rgba(0,0,0,0.3)" }}>
            arcade.exe // Lumenati Arcade
          </span>
          <span
            role="button"
            aria-label="Back to check-in"
            onClick={close}
            style={{ fontFamily: "Tahoma,sans-serif", fontSize: 11, color: "#fff", cursor: "pointer", padding: "0 6px" }}
          >
            BACK TO CHECK-IN &#10005;
          </span>
        </div>
        <div style={{ padding: 4, background: "#ece9d8" }}>
          <canvas
            id="jd-skate-canvas"
            width={400}
            height={320}
            style={{
              display: "block",
              width: 720,
              maxWidth: "100%",
              height: "auto",
              imageRendering: "pixelated",
              touchAction: "none",
              border: "1px solid",
              borderColor: "#808080 #fff #fff #808080",
              background: "#000",
            }}
          />
        </div>
        <div
          style={{
            padding: "4px 8px",
            background: "#ece9d8",
            borderTop: "1px solid #aca899",
            fontFamily: "Tahoma,sans-serif",
            fontSize: 10,
            color: "#444",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            <span id="jd-stat-a">Score</span>: <span id="jd-br-score">0</span>
          </span>
          <span>
            <span id="jd-stat-b">Lives</span>: <span id="jd-br-lives">3</span>
          </span>
          <span id="jd-game-hint">{GAME_CATALOG.length} games // INSERT COIN</span>
        </div>
      </div>
    </div>
  );
}
