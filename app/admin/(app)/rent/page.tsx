"use client";

import { useCallback, useEffect, useState } from "react";
import { useRent } from "@/lib/admin/rent-context";
import { useArtists } from "@/lib/admin/artists-context";
import { fmt } from "@/lib/admin/calc";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";

export default function RentPage() {
  const { invoices, loading, outstandingCents, collectedCents, overdue } = useRent();

  const unpaid = invoices.filter((i) => !i.paid).sort((a, b) => (a.dueDate || "") < (b.dueDate || "") ? -1 : 1);
  const paid = invoices.filter((i) => i.paid);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Booth Rent</h1>
        <p className="text-sm text-black/50">Live from Square invoices. Who&apos;s paid, who&apos;s behind.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding" value={fmt(outstandingCents)} tone={outstandingCents ? "warn" : "good"} accent />
        <StatCard label="Overdue" value={String(overdue.length)} tone={overdue.length ? "warn" : "good"} sub={overdue.length ? "past due date" : "none"} />
        <StatCard label="Collected" value={fmt(collectedCents)} tone="good" sub="paid this cycle" />
        <StatCard label="Invoices" value={String(invoices.length)} />
      </div>

      <InHouseRent />

      <SectionTitle>Outstanding</SectionTitle>
      <Card className="mb-5">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-black/40">Loading from Square…</div>
        ) : unpaid.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-black/40">All rent is paid. 🎉</div>
        ) : (
          <div className="divide-y divide-black/5">
            {unpaid.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-black/45">
                    {i.title}
                    {i.dueDate && ` · due ${i.dueDate}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tnum text-sm font-semibold">{fmt(i.amountCents)}</span>
                  {i.overdue ? (
                    <Badge tone="bad">overdue</Badge>
                  ) : i.status === "SCHEDULED" ? (
                    <Badge>scheduled</Badge>
                  ) : (
                    <Badge tone="warn">unpaid</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {paid.length > 0 && (
        <>
          <SectionTitle>Paid</SectionTitle>
          <Card>
            <div className="divide-y divide-black/5">
              {paid.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-black/45">{i.title}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-sm text-black/55">{fmt(i.amountCents)}</span>
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
// off Square invoices; the Square panels above keep working until then.
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
  const current = invoices.filter((i) => i.period === period);
  const artistName = (id: string) => artists.find((a) => a.id === id)?.name ?? id;
  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
        In-house invoices <span className="font-normal text-black/35">· the off-Square path</span>
      </SectionTitle>
      {msg && (
        <div className="mb-3 rounded-lg border border-black/8 bg-white px-3 py-2 text-xs text-black/60 shadow-sm">{msg}</div>
      )}
      <Card>
        {!configured ? (
          <div className="px-4 py-4 text-xs text-black/45">
            Run <code className="font-mono">supabase/rent-invoices-schema.sql</code> in Supabase, then
            Generate creates this month&apos;s invoices with pay links — rent without Square.
          </div>
        ) : current.length === 0 ? (
          <div className="px-4 py-5 text-center text-sm text-black/40">
            No {monthLabel} invoices yet — Generate makes one per rent/hybrid artist, each with a pay link.
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {current.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{artistName(i.artist_id)}</div>
                  <div className="text-xs text-black/45">
                    {monthLabel}
                    {i.due_date ? ` · due ${i.due_date.slice(5)}` : ""}
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
                          className="rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium text-black/55 hover:bg-black/4"
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
