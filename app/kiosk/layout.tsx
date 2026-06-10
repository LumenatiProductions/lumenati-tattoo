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

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  // No chrome — the screens own the full canvas (the TV backdrop especially).
  return (
    <div
      className={`${pixel.variable} ${vt.variable} ${techmono.variable} scanlines y2k-bg relative flex min-h-screen flex-col text-cream`}
    >
      <main className="flicker relative z-10 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
