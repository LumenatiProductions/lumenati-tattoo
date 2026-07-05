"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useBookings } from "@/lib/admin/bookings-context";
import { useInventory } from "@/lib/admin/inventory-context";
import { useFollowups } from "@/lib/admin/followups-context";
import { useClients } from "@/lib/admin/clients-context";
import { useArtists } from "@/lib/admin/artists-context";
import { fmt } from "@/lib/admin/calc";
import { StatCard, Card, SectionTitle, Badge } from "@/components/admin/ui";
import { PageHead, Empty, clock, isToday } from "./shared";

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  scheduled: "neutral",
  completed: "good",
  no_show: "bad",
  cancelled: "neutral",
};

// Front desk: run the day. Today's schedule, deposits to chase, low stock, and
// the front-of-house quick actions. No money internals.
export default function FrontDeskHome() {
  const { bookings, today, depositsHeld } = useBookings();
  const { lowStock } = useInventory();
  const { dueToday: followupsDue } = useFollowups();
  const { clients } = useClients();
  const { artists } = useArtists();

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]));
    return (id: string | null) => (id ? m.get(id) ?? "Client" : "Walk-in");
  }, [clients]);
  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name]));
    return (id: string | null) => (id ? m.get(id) ?? "" : "");
  }, [artists]);

  const todays = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== "cancelled" && isToday(b.starts_at))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [bookings],
  );

  return (
    <div>
      <PageHead title="Front Desk" sub="Today at the shop" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Appointments today" value={String(today)} accent />
        <StatCard label="Deposits held" value={fmt(depositsHeld)} />
        <StatCard
          label="Low stock"
          value={String(lowStock.length)}
          tone={lowStock.length ? "warn" : "neutral"}
          sub={lowStock.length ? "needs reorder" : "all stocked"}
        />
        <StatCard
          label="Follow-ups due"
          value={String(followupsDue)}
          tone={followupsDue ? "warn" : "neutral"}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/clients" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          New client
        </Link>
        <Link href="/admin/intake" className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium">
          Send intake
        </Link>
        <Link href="/admin/bookings" className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium">
          Bookings
        </Link>
        <Link href="/admin/cash" className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium">
          Cash log
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle
            action={<Link href="/admin/bookings" className="text-xs font-medium text-brand">All bookings →</Link>}
          >
            Today&apos;s schedule
          </SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {todays.length === 0 && <Empty>No appointments today.</Empty>}
              {todays.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{clientName(b.client_id)}</div>
                    <div className="text-xs text-white/60">
                      {clock(b.starts_at)}
                      {artistName(b.artist_id) ? ` · ${artistName(b.artist_id)}` : ""}
                      {b.service_desc ? ` · ${b.service_desc}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.deposit_status === "held" && <Badge tone="good">deposit</Badge>}
                    <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.replace("_", " ")}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <SectionTitle
            action={<Link href="/admin/inventory" className="text-xs font-medium text-brand">Inventory →</Link>}
          >
            Running low
          </SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {lowStock.length === 0 && <Empty>Everything&apos;s stocked.</Empty>}
              {lowStock.slice(0, 8).map((it) => (
                <div key={it.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="truncate">{it.name}</span>
                  <span className={it.qty <= 0 ? "text-rose-400" : "text-amber-400"}>
                    {it.qty} {it.unit}
                    {it.qty === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
