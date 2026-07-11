"use client";

import Link from "next/link";
import { useMemo } from "react";
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
      }).slice(0, 4),
    [sales, bookings, artists, rentOutstanding, dueToday],
  );

  if (tips.length === 0) return null;

  return (
    <div className="mb-5">
      <SectionTitle>
        Coach <span className="font-normal text-white/50">· reads from your own numbers, nothing invented</span>
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {tips.map((tip) => (
          <Card key={tip.title} className="flex flex-col p-4">
            <div className="text-[15px] font-semibold">{tip.title}</div>
            <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-white/60">{tip.body}</p>
            {tip.href && (
              <Link href={tip.href} className="mt-3 text-sm font-semibold text-brand">
                Open →
              </Link>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
