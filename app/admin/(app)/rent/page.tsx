"use client";

import { useCallback, useEffect, useState } from "react";
import { useRent } from "@/lib/admin/rent-context";
import { useArtists } from "@/lib/admin/artists-context";
import { fmt } from "@/lib/admin/calc";
import { Card, PageHeader, SectionTitle, StatCard, StatRow, Badge } from "@/components/admin/ui";

export default function RentPage() {
  const { invoices, loading, outstandingCents, collectedCents, overdue } = useRent();

  const paid = invoices.filter((i) => i.paid);

  return (
    <div>
      <PageHeader title="Booth Rent" subtitle="Who's paid, who's behind." />

      <StatRow>
        <StatCard label="Outstanding" value={fmt(outstandingCents)} tone={outstandingCents ? "warn" : "good"} accent />
        <StatCard label="Overdue" value={String(overdue.length)} tone={overdue.length ? "warn" : "good"} sub={overdue.length ? "past due date" : "none"} />
        <StatCard label="Collected" value={fmt(collectedCents)} tone="good" sub="paid this cycle" />
        <StatCard label="Invoices" value={String(invoices.length)} />
      </StatRow>

      <InHouseRent />

      {paid.length > 0 && (
        <>
          <SectionTitle>Paid</SectionTitle>
          <Card>
            <div className="divide-y divide-white/8">
              {paid.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-white/60">{i.title}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-sm text-white/70">{fmt(i.amountCents)}</span>
                    <Badge tone="good">paid</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// In-house invoices (rent-invoices-schema.sql): generated monthly, paid via
// our own Stripe links, marked paid by the webhook. This is the cutover path
// off our own Stripe links; the stats above read the same table.
function InHouseRent() {
  type Invoice = {
    id: string;
    artist_id: string;
    period: string;
    amount_cents: number;
    due_date: string | null;
    status: string;
    pay_url: string | null;
  };
  const { artists } = useArtists();
  const [configured, setConfigured] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/rent/invoices");
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setConfigured(d.configured !== false);
        setInvoices(d.invoices || []);
      }
    } catch {
      /* section stays minimal */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>, okMsg: (d: Record<string, unknown>) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/rent/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || "That didn't work.");
        return;
      }
      setMsg(okMsg(d));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const period = new Date().toISOString().slice(0, 7);
  // Every unpaid invoice from ANY month stays visible (old rent doesn't vanish
  // when the calendar turns) + whatever this month already settled.
  const visible = invoices
    .filter((i) => i.status !== "paid" || i.period === period)
    .sort((a, b) => (a.period === b.period ? a.artist_id.localeCompare(b.artist_id) : a.period < b.period ? -1 : 1));
  const artistName = (id: string) => artists.find((a) => a.id === id)?.name ?? id;
  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const periodLabel = (p: string) =>
    new Date(`${p}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="mb-6">
      <SectionTitle
        action={
          <button
            onClick={() => act({ action: "generate" }, (d) => `Generated ${d.created ?? 0} invoice${d.created === 1 ? "" : "s"} for ${monthLabel}.`)}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Working…" : `Generate ${monthLabel}`}
          </button>
        }
      >
        Invoices <span className="font-normal text-white/50">· generated monthly, paid by link or in cash</span>
      </SectionTitle>
      {msg && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/75 shadow-sm">{msg}</div>
      )}
      <Card>
        {!configured ? (
          <div className="px-4 py-4 text-xs text-white/60">
            Booth rent invoicing isn&apos;t turned on yet. Once it&apos;s on, Generate creates this
            month&apos;s invoices, one per booth renter, each with a pay link.
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-5 text-center text-sm text-white/55">
            No {monthLabel} invoices yet. Generate makes one per booth renter, each with a pay link.
          </div>
        ) : (
          <div className="divide-y divide-white/8">
            {visible.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{artistName(i.artist_id)}</div>
                  <div className="text-xs text-white/60">
                    {periodLabel(i.period)}
                    {i.due_date ? ` · due ${i.due_date.slice(5)}` : ""}
                    {i.status !== "paid" && i.period < period ? " · PAST MONTH" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tnum text-sm font-semibold">{fmt(i.amount_cents)}</span>
                  {i.status === "paid" ? (
                    <Badge tone="good">paid</Badge>
                  ) : (
                    <>
                      <Badge tone="warn">unpaid</Badge>
                      {i.pay_url && (
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(i.pay_url!);
                            setMsg(`Pay link for ${artistName(i.artist_id)} copied.`);
                          }}
                          className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/6"
                        >
                          Copy link
                        </button>
                      )}
                      <button
                        onClick={() => act({ action: "email", id: i.id }, (d) => `Emailed to ${d.sentTo}.`)}
                        disabled={busy}
                        className="rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
                      >
                        Email it
                      </button>
                      {/* Artist handed over cash/check — book it without Stripe. */}
                      <button
                        onClick={() =>
                          act({ action: "mark_paid", id: i.id, method: "cash" }, (d) =>
                            d.warning ? String(d.warning) : `${artistName(i.artist_id)} marked paid (cash).`,
                          )
                        }
                        disabled={busy}
                        className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/6 disabled:opacity-40"
                      >
                        Paid cash
                      </button>
                      <button
                        onClick={() =>
                          act({ action: "mark_paid", id: i.id, method: "check" }, (d) =>
                            d.warning ? String(d.warning) : `${artistName(i.artist_id)} marked paid (check).`,
                          )
                        }
                        disabled={busy}
                        className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/6 disabled:opacity-40"
                      >
                        Paid check
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
