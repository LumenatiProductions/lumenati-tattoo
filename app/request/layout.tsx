import "./request.css";

// Pulls Tailwind into the public booking-request page only (same scoping
// pattern as /pay and /intake — the Y2K site never sees it).
export default function RequestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
