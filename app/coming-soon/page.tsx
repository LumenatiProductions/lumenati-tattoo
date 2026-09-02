import type { Metadata } from "next";
import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

// Site-wide cover while the new site gets sorted (Scott, 2026-09-02).
// middleware.ts rewrites every public Y2K page here when SITE_COMING_SOON is
// set. /admin, /request, /privacy, /terms and the other app routes stay live.
// Preview the real site with ?preview=1 on any page (sets a cookie).
//
// The cover IS the Lumenati OnLine sign-on: Sign On dials, gets two steps in,
// and hits the busy signal with the shop's contact details. Lift the cover and
// the very same screen connects for real.

export const metadata: Metadata = {
  title: "Lumenati Tattoo",
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  const signon = readLegacyBlock("aol-signon.html");
  return (
    <main style={{ minHeight: "100dvh", margin: 0, background: "#1e2a5e" }}>
      <LegacyBlock html={`<script>window.__AOL_COMING_SOON__=true;</script>${signon}`} />
    </main>
  );
}
