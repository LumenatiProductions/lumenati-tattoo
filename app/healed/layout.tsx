import "./healed.css";

// Pulls Tailwind into the healed-photo upload page only (same scoping pattern
// as /pay and /intake — the Y2K site never sees it).
export default function HealedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
