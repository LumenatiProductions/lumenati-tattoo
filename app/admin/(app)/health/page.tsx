"use client";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { PageHeader, Card } from "@/components/admin/ui";

// The early-warning board. Owner-only. Shows operational failures the shop would
// otherwise never see — a text that didn't send, a payment dispute, an app error
// — so they can be caught before a client feels them. Read from /api/health.

type OpsEvent = {
  id: string;
  kind: string;
  severity: "info" | "warn" | "error";
  summary: string;
  detail: string | null;
  created_at: string;
  resolved_at: string | null;
};

// Plain-English names — no one should have to know what a "webhook" is.
const KIND_LABEL: Record<string, string> = {
  payment_failed: "Payment failed",
  dispute: "Payment dispute",
  sms_failed: "Text didn't send",
  email_failed: "Email didn't send",
  webhook_error: "Payment sync problem",
  cron_error: "Automation problem",
  client_error: "App error",
};

const DOT: Record<string, string> = {
  error: "bg-rose-400",
  warn: "bg-amber-400",
  info: "bg-white/40",
};

function ago(iso: string): string {
  const secs = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function HealthPage() {
  const { realRole } = useRole();
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/health");
    const d = await r.json().catch(() => ({ events: [] }));
    setEvents((d.events as OpsEvent[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }

  const resolve = async (id?: string) => {
    setBusy(true);
    await fetch("/api/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { action: "resolve", id } : { action: "resolve_all" }),
    });
    await load();
    setBusy(false);
  };

  const unresolved = events.filter((e) => !e.resolved_at);
  const resolved = events.filter((e) => e.resolved_at);

  const Row = ({ e, dim }: { e: OpsEvent; dim?: boolean }) => (
    <div className={`border-b border-white/8 last:border-0 ${dim ? "opacity-55" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`h-2 w-2 flex-none rounded-full ${DOT[e.severity] ?? DOT.info}`} />
        <button
          onClick={() => setOpen(open === e.id ? null : e.id)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-sm font-semibold">{e.summary}</div>
          <div className="mt-0.5 text-xs text-white/55">
            {KIND_LABEL[e.kind] ?? e.kind} · {ago(e.created_at)}
          </div>
        </button>
        {!e.resolved_at ? (
          <button
            onClick={() => resolve(e.id)}
            disabled={busy}
            className="flex-none rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50"
          >
            Mark handled
          </button>
        ) : (
          <span className="flex-none text-xs text-emerald-400">Handled</span>
        )}
      </div>
      {open === e.id && e.detail && (
        <div className="px-4 pb-3">
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/30 px-3 py-2 text-xs text-white/70">
            {e.detail}
          </pre>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Health"
        subtitle="Things that quietly went wrong — a text that didn't send, a payment dispute, an app error. Catch them before a client does."
        action={
          unresolved.length > 0 ? (
            <button
              onClick={() => resolve()}
              disabled={busy}
              className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-semibold text-white/85 hover:bg-white/5 disabled:opacity-50"
            >
              Mark all handled
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <p className="text-sm text-white/55">Loading…</p>
      ) : events.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-emerald-400">All clear</div>
            <p className="mt-1 text-sm text-white/60">Nothing has gone wrong in the last 30 days.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              Needs attention{unresolved.length ? ` · ${unresolved.length}` : ""}
            </div>
            <Card>
              {unresolved.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/55">Nothing open. Nicely done.</p>
              ) : (
                unresolved.map((e) => <Row key={e.id} e={e} />)
              )}
            </Card>
          </div>

          {resolved.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">Handled</div>
              <Card>{resolved.map((e) => <Row key={e.id} e={e} dim />)}</Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
