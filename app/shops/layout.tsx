import type { Metadata } from "next";
import "./shops.css";

// The marketing front door for OTHER shops — scoped Tailwind like /admin
// and /s, so Lumenati's Y2K root never sees it.
export const metadata: Metadata = {
  title: "Lumenati for tattoo shops",
  description:
    "Keep your website. We take over everything behind it. Artist pages built to get booked, plus the Command Center that runs the whole back office.",
};

export default function ShopsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
