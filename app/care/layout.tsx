import "./care.css";

// Pulls Tailwind into the aftercare timeline only (same scoping pattern as
// /healed and /pay — the Y2K site never sees it).
export default function CareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
