import Link from "next/link";
import { Icon } from "@/components/marketing/Icon";

// The two-cell CTA (MotionSites pattern): a pink text cell and an arrow cell
// with a 2px seam. On hover the arrow flies out the right and a twin flies in
// from the left. Pure CSS (shops.css .mkt-cta*), no client JS.
export function ArrowCta({
  href,
  big = false,
  children,
}: {
  href: string;
  big?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`mkt-cta ${big ? "mkt-cta-big" : ""}`}>
      <span className="mkt-cta-text">{children}</span>
      <span className="mkt-cta-cell" aria-hidden>
        <Icon name="arrow" className="mkt-cta-a1" />
        <Icon name="arrow" className="mkt-cta-a2" />
      </span>
    </Link>
  );
}
