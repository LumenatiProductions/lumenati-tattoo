// Shared brand tokens. Money Glow + Liquid Ink (2026-07-05, Scott's pick):
// blue-violet blacks stacked in glass layers over an ink-wash atmosphere
// (components/InkWash). The discipline that makes it work:
//   - pink means MONEY: primary money action, the paid moment. Nothing else.
//   - green means earnings/up. warn/bad keep their semantic jobs.
//   - surfaces are translucent and lit from the top edge, not outlined.
//   - numbers are the heroes: tabular, big, and they tick, never just appear.
// The Y2K personality lives on the public site and in Y2kPaidFX only.
export const theme = {
  // Ink-black with a blue-violet lean — never pure #000, the void reads cheap.
  bg: "#0a0a11",
  // Glass ladder: three translucent levels that compound over the ink wash.
  surface: "rgba(165,180,235,0.07)",
  surfaceRaised: "rgba(175,190,240,0.12)",
  border: "rgba(170,185,235,0.14)",
  borderStrong: "rgba(180,195,245,0.26)",
  // The lit top edge that makes a panel read as glass instead of a rectangle.
  glassEdge: "rgba(205,220,255,0.28)",
  text: "#f4f5ff",
  textDim: "rgba(235,238,255,0.68)",
  textFaint: "rgba(228,233,255,0.44)",
  brand: "#ff1493",
  brandSoft: "rgba(255,20,147,0.10)",
  brandBorder: "rgba(255,20,147,0.45)",
  good: "#3ddc97",
  goodSoft: "rgba(61,220,151,0.12)",
  warn: "#fbbf24",
  warnSoft: "rgba(251,191,36,0.12)",
  bad: "#fb7185",
  badSoft: "rgba(251,113,133,0.12)",
  // Lumenati parent-brand typeface (matches the web console/pay/kiosk). iOS ships
  // Helvetica Neue; Android falls back to its system sans.
  font: "Helvetica Neue",
  radius: { sm: 10, md: 14, lg: 18, xl: 24 },
  // One soft shadow used by raised cards + the primary button glow.
  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  glow: {
    shadowColor: "#ff1493",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
