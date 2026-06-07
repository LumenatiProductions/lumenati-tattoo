// The Lumenati parent-brand lockup (all-seeing-eye + wordmark) used across the
// console, payments, intake, and kiosk — the non-Y2K surfaces. Two colorways:
//   bg="light"  → dark marks, for light surfaces (sidebar, login, cards)
//   bg="dark"   → white marks, for dark surfaces (pay/intake headers, kiosk)
// Cropped SVGs live in /public/brand. Size it via className (set a width;
// the ~1.54:1 aspect is preserved). Plain <img> so we don't need next/image's
// dangerouslyAllowSVG.
export function LumenatiLogo({
  bg = "light",
  className = "",
}: {
  bg?: "light" | "dark";
  className?: string;
}) {
  const src = bg === "dark" ? "/brand/lumenati-on-dark.svg" : "/brand/lumenati-on-light.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Lumenati" className={className} />;
}
