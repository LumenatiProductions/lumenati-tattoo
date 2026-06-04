"use client";

import { ARTISTS, SALES, RENT_CHARGES } from "@/lib/admin/mock-data";
import { statementFor, fmt, payTypeLabel } from "@/lib/admin/calc";
import { Card, SectionTitle, Badge, Dot, MockBanner } from "@/components/admin/ui";

export default function ArtistsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Artists &amp; Pay</h1>
        <p className="text-sm text-black/50">
          Each artist&apos;s booth arrangement. Rent, split, or hybrid — set per artist.
        </p>
      </div>
      <MockBanner source="Square (artist linking)" />

      <SectionTitle>The crew</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ARTISTS.map((a) => {
          const st = statementFor(a, SALES, RENT_CHARGES);
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {a.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {a.name}
                      {a.guest && <Badge>guest</Badge>}
                    </div>
                    <div className="text-xs text-black/45">@{a.handle}</div>
                  </div>
                </div>
                <Badge tone="brand">{payTypeLabel(a)}</Badge>
              </div>
              <div className="grid grid-cols-3 border-t border-black/6 text-center">
                <Stat label="Tickets" value={String(st.saleCount)} />
                <Stat label="Service" value={fmt(st.grossService)} />
                <Stat label="Shop cut" value={fmt(st.shopCut + st.rentOwed)} />
              </div>
              <div className="flex items-center justify-between border-t border-black/6 px-4 py-2.5">
                <span className="text-xs text-black/45">Square</span>
                {a.squareTeamMemberId ? (
                  <Badge tone="good">linked</Badge>
                ) : (
                  <Badge tone="warn">not linked</Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-black/45">
        <Dot color="#FF1493" />
        Editing arrangements, adding artists, and linking Square members lands with
        the Square connection.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <div className="tnum text-sm font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-black/40">{label}</div>
    </div>
  );
}
