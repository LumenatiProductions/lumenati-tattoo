// Shared brand tokens (mirrors the web admin + kiosk: dark surface, pink accent).
// The app is the console's dark sibling: near-black ground, soft elevated
// cards, Helvetica, pink spent ONLY on the money moments and primary actions.
export const theme = {
  bg: "#0b0b0e",
  surface: "#15151b",
  surfaceRaised: "#1b1b23",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  text: "#ffffff",
  textDim: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.32)",
  brand: "#ff1493",
  brandSoft: "rgba(255,20,147,0.10)",
  brandBorder: "rgba(255,20,147,0.45)",
  good: "#34d399",
  goodSoft: "rgba(52,211,153,0.12)",
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
