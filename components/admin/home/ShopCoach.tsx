"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSales } from "@/lib/admin/sales-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useBookings } from "@/lib/admin/bookings-context";
import { useFollowups } from "@/lib/admin/followups-context";
import { useRent } from "@/lib/admin/rent-context";
import { shopCoachTips } from "@/lib/admin/shop-coach";
import { Card, SectionTitle } from "@/components/admin/ui";

// The shop coach on desktop — same reads as the app's shop home, rendered as
// a card row on the owner overview. Deterministic math on the shop's own
// rows; a good week can legitimately show nothing, so the section hides when
// there's no read worth making.
export default function ShopCoach() {
  const { sales } = useSales();
  const { artists } = useArtists();
  const { bookings } = useBookings();
  const { dueToday } = useFollowups();
  const { outstandingCents: rentOutstanding } = useRent();

  const tips = useMemo(
    () =>
      shopCoachTips({
        sales: sales.map((s) => ({
          date: s.date,
          serviceCents: s.serviceCents,
          tipCents: s.tipCents,
          artistId: s.artistId ?? null,
        })),
        bookings: bookings.map((b) => ({
          starts_at: b.starts_at,
          status: b.status,
          client_id: b.client_id,
          deposit_status: b.deposit_status,
        })),
        artistNames: new Map(artists.map((a) => [a.id, a.name])),
        rentOutstandingCents: rentOutstanding,
        followupsDue: dueToday,
      }).slice(0, 2), // two reads, not four: the rest wait their turn
    [sales, bookings, artists, rentOutstanding, dueToday],
  );

  // One line per read; the reasoning opens on demand (Scott, 2026-09-01:
  // the coach cards were paragraphs).
  const [open, setOpen] = useState<string | null>(null);

  if (tips.length === 0) return null;

  return (
    <div className="mb-5">
      <SectionTitle>
        Coach <span className="font-normal text-white/50">· reads from your own numbers, nothing invented</span>
      </SectionTitle>
      <Card>
        {tips.map((tip, i) => (
          <div key={tip.title} className={`px-4 py-3 ${i > 0 ? "border-t border-white/8" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="text-[15px] font-semibold">{tip.title}</div>
              <button
                type="button"
                onClick={() => setOpen((o) => (o === tip.title ? null : tip.title))}
                className="text-xs font-medium text-white/55 hover:text-white/80"
              >
                {open === tip.title ? "Hide" : "Why"}
              </button>
              {tip.href && (
                <Link href={tip.href} className="ml-auto text-sm font-semibold text-brand">
                  Open →
                </Link>
              )}
            </div>
            {open === tip.title && (
              <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-white/60">{tip.body}</p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
