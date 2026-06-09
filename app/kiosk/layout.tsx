import "./kiosk.css";
import { Press_Start_2P, VT323, Share_Tech_Mono } from "next/font/google";

// FULL Y2K kiosk shell. Front-of-house, so it wears the public site's neon/CRT
// look (not the clean Lumenati console). next/font loads the three retro faces;
// the appleWebApp meta makes "Add to Home Screen" launch fullscreen (no Safari
// URL bar) so a locked iPad in Guided Access reads as a real kiosk.
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-pixel" });
const vt = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt" });
const techmono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-techmono" });

export const metadata = {
  title: "Lumenati // Check in",
  appleWebApp: { capable: true, title: "Lumenati", statusBarStyle: "black-translucent" as const },
};

export const viewport = {
  themeColor: "#06060a",
  viewportFit: "cover" as const,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const TICKER =
  "✦ WELCOME TO LUMENATI ✦ STEP INTO THE BEDROOM ✦ TAP YOUR NAME TO CHECK IN ✦ STAY GOLD ✦ NO REGRETS ✦ INK NEVER LIES ✦ THE EYE SEES YOU ✦";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${pixel.variable} ${vt.variable} ${techmono.variable} scanlines y2k-bg relative flex min-h-screen flex-col text-cream`}
    >
      {/* Top chrome: neon rule + retro window title + marquee */}
      <div className="neon-bar" />
      <div className="flex items-center justify-between px-4 py-2">
        <span className="f-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300/70">
          <span className="glow-lime blink">●</span> LUMENATI OS · CHECK-IN.EXE
        </span>
        <span className="f-mono text-[11px] uppercase tracking-[0.2em] text-white/35">v2.0 // 1999</span>
      </div>
      <div className="marquee f-pixel border-y border-white/10 bg-black/40 py-1.5 text-[9px] text-pink-300/80">
        <span className="marquee-track">{TICKER}</span>
      </div>

      {/* Screens */}
      <main className="flicker relative z-10 flex flex-1 flex-col">{children}</main>

      {/* Bottom status bar */}
      <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-4 py-2">
        <span className="f-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
          SECURE TERMINAL // POWERED BY THE EYE
        </span>
        <span className="f-mono text-[10px] uppercase tracking-[0.2em] text-lime-300/60">▲ ONLINE</span>
      </div>
      <div className="neon-bar" />
    </div>
  );
}
