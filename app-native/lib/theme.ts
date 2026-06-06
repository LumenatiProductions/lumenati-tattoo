// Shared brand tokens (mirrors the web admin + kiosk: dark surface, pink accent).
export const theme = {
  bg: "#0e0e11",
  surface: "#17171c",
  border: "rgba(255,255,255,0.10)",
  text: "#ffffff",
  textDim: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.35)",
  brand: "#ff1493",
  good: "#34d399",
  warn: "#fbbf24",
};

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
