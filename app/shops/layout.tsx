import type { Metadata } from "next";
import "./shops.css";

// The marketing front door for OTHER shops — scoped Tailwind like /admin
// and /s, so Lumenati's Y2K root never sees it. openGraph/twitter give the
// link a rich unfurl in iMessage, socials, etc. (image: scripts/gen-og.mjs).
const TITLE = "Everything but the tattoo. | Lumenati";
const DESC =
  "The business brain for tattoo shops. Lumenati coaches the shop and every artist, keeps the books, texts the follow-ups, and runs goals and taxes for every chair.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://lumenatiapp.com"),
  title: TITLE,
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/shops",
    siteName: "Lumenati",
    type: "website",
    images: [{ url: "/marketing/og-shops.png", width: 1200, height: 630, alt: "Lumenati — the business brain for tattoo shops" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/marketing/og-shops.png"],
  },
};

export default function ShopsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
