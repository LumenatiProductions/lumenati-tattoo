"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useBookings } from "@/lib/admin/bookings-context";
import { useInventory } from "@/lib/admin/inventory-context";
import { useCompliance } from "@/lib/admin/compliance-context";
import { useFollowups } from "@/lib/admin/followups-context";
import { fmt } from "@/lib/admin/calc";
import { Card, SectionTitle } from "@/components/admin/ui";
import { isToday } from "@/components/admin/home/shared";

// The owner cockpit (POS-STARTER-4): every feature's headline as a glance row of
// tiles, plus a single ranked "needs attention" list — the things actually
// needing a decision, most urgent first, each linking straight to where you act.

type Sev = "high" | "med" | "low";
const SEV_RANK: Record<Sev, number> = { high: 0, med: 1, low: 2 };

type Item = { key: string; sev: Sev; label: string; detail?: string; href: string };

export default function Cockpit() {
  const { bookings, today, depositsHeld } = useBookings();
  const { lowStock } = useInventory();
  const { expiringSoon } = useCompliance();
  const { dueToday: followupsDue, pending: followupsPending } = useFollowups();

  const checkedInToday = useMemo(
    () => bookings.filter((b) => isToday(b.starts_at) && b.checked_in_at).length,
    [bookings],
  );
  const outOfStock = useMemo(() => lowStock.filter((i) => i.qty <= 0), [lowStock]);
  const expired = useMemo(() => expiringSoon.filter((c) => c.status === "expired"), [expiringSoon]);

  const items = useMemo(() => {
    const out: Item[] = [];
    if (expired.length)
      out.push({ key: "comp-exp", sev: "high", label: `${expired.length} license/permit expired`, detail: "renew to stay inspection-ready", href: "/admin/compliance" });
    const expiringNotExpired = expiringSoon.length - expired.length;
    if (expiringNotExpired > 0)
      out.push({ key: "comp-soon", sev: "med", label: `${expiringNotExpired} expiring within 30 days`, href: "/admin/compliance" });
    if (outOfStock.length)
      out.push({ key: "stock-out", sev: "high", label: `${outOfStock.length} suppl${outOfStock.length === 1 ? "y" : "ies"} out`, detail: outOfStock.slice(0, 3).map((i) => i.name).join(", "), href: "/admin/inventory" });
    const lowNotOut = lowStock.length - outOfStock.length;
    if (lowNotOut > 0)
      out.push({ key: "stock-low", sev: "med", label: `${lowNotOut} item${lowNotOut === 1 ? "" : "s"} low`, detail: "below reorder point", href: "/admin/inventory" });
    if (followupsDue)
      out.push({ key: "fu", sev: "med", label: `${followupsDue} follow-up${followupsDue === 1 ? "" : "s"} due`, detail: followupsPending ? `${followupsPending} pending total` : undefined, href: "/admin/followups" });
    if (today)
      out.push({ key: "appts", sev: "low", label: `${today} appointment${today === 1 ? "" : "s"} today`, detail: `${checkedInToday} checked in`, href: "/admin/bookings" });
    if (depositsHeld)
      out.push({ key: "dep", sev: "low", label: `${fmt(depositsHeld)} in deposits held`, href: "/admin/bookings" });
    return out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
  }, [expired, expiringSoon, outOfStock, lowStock, followupsDue, followupsPending, today, checkedInToday, depositsHeld]);

  return (
    <div className="mb-6">
      {/* Glance tiles */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Today" value={`${checkedInToday}/${today}`} sub="checked in" href="/admin/bookings" />
        <Tile label="Deposits held" value={fmt(depositsHeld)} href="/admin/bookings" />
        <Tile label="Low stock" value={String(lowStock.length)} href="/admin/inventory" warn={lowStock.length > 0} />
        <Tile label="Licenses expiring" value={String(expiringSoon.length)} href="/admin/compliance" warn={expiringSoon.length > 0} />
        <Tile label="Follow-ups due" value={String(followupsDue)} href="/admin/followups" warn={followupsDue > 0} />
      </div>

      <SectionTitle>Needs attention</SectionTitle>
      <Card>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-white/55">
            All clear. Nothing needs a decision right now.
          </div>
        ) : (
          <div className="divide-y divide-white/8">
            {items.map((it) => (
              <Link key={it.key} href={it.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  <Sevdot sev={it.sev} />
                  <div>
                    <div className="text-sm font-medium">{it.label}</div>
                    {it.detail && <div className="text-xs text-white/60">{it.detail}</div>}
                  </div>
                </div>
                <span className="text-sm text-white/45">›</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, href, warn }: { label: string; value: string; sub?: string; href: string; warn?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-xl border bg-white/6 px-4 py-3 transition hover:shadow-sm ${warn ? "border-amber-400/40" : "border-white/10"}`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-white/60">{label}</div>
      <div className={`tnum mt-1 text-xl font-semibold ${warn ? "text-amber-400" : "text-ink"}`}>{value}</div>
      {sub && <div className="text-[11px] text-white/55">{sub}</div>}
    </Link>
  );
}

function Sevdot({ sev }: { sev: Sev }) {
  const c = sev === "high" ? "bg-rose-500" : sev === "med" ? "bg-amber-500" : "bg-white/25";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c}`} />;
}
