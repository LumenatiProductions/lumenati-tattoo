import "./s.css";

// The standard (non-Y2K) public template lives under /s/<shop>. Tailwind is
// scoped here exactly like /care and /healed — Lumenati's Y2K pages at the
// root never see it.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
