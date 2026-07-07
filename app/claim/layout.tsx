import "./claim.css";

// Pulls Tailwind into the claim page only (same scoping pattern as /care and
// /healed — the Y2K site never sees it).
export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return children;
}
