import type { Metadata } from "next";

// Site-wide cover while the new site gets sorted (Scott, 2026-09-02).
// middleware.ts rewrites every public Y2K page here when SITE_COMING_SOON is
// set. /admin, /request, /privacy, /terms and the other app routes stay live.
// Preview the real site with ?preview=1 on any page (sets a cookie).

export const metadata: Metadata = {
  title: "Lumenati Tattoo",
  robots: { index: false, follow: false },
};

const PINK = "#FF1493";

export default function ComingSoonPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        margin: 0,
        background: "#0a0a0d",
        color: "#f4f4f5",
        fontFamily: "'Courier New', Courier, monospace",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div
          style={{
            border: `2px solid ${PINK}`,
            background: "#101016",
          }}
        >
          <div
            style={{
              background: PINK,
              color: "#fff",
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>lumenati.exe</span>
            <span style={{ letterSpacing: 3 }}>_ &#9633; &#10005;</span>
          </div>
          <div style={{ padding: "28px 24px 26px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/lumenati-on-dark.svg"
              alt="Lumenati Tattoo"
              style={{ width: 180, height: "auto", display: "block", marginBottom: 22 }}
            />
            <p style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 10px", color: "#7fff00" }}>
              New site coming soon<span style={{ color: PINK }}>.</span>
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.75, margin: "0 0 22px", color: "#d4d4d8" }}>
              The shop is open. Bookings, questions, walk-ins: reach us the old way for now.
            </p>
            <p style={{ fontSize: 15, lineHeight: 2, margin: 0 }}>
              <a href="mailto:hi@lumenatitattoo.com" style={{ color: "#00ffff" }}>
                hi@lumenatitattoo.com
              </a>
              <br />
              <a
                href="https://instagram.com/lumenati.tattoo"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#00ffff" }}
              >
                @lumenati.tattoo
              </a>
              <br />
              <span style={{ color: "#a1a1aa" }}>3100 N Downing St, Denver</span>
            </p>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#3f3f46", letterSpacing: 2, marginTop: 10, textAlign: "center" }}>
          &#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;
        </p>
      </div>
    </main>
  );
}
