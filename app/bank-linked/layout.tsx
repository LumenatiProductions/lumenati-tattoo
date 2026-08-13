import "./bank-linked.css";

// Pulls Tailwind into the bank-link return page only (same scoping pattern as
// /claim and /care — the Y2K site never sees it). Without it this route got
// just the global reset and rendered unstyled.
export default function BankLinkedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
