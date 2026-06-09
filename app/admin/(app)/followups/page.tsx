"use client";

import { useMemo, useState } from "react";
import { useFollowups, type Followup } from "@/lib/admin/followups-context";
import { useClients } from "@/lib/admin/clients-context";
import { useRole } from "@/lib/admin/role-context";
import { KIND_LABEL, type FollowupKind, type Template } from "@/lib/followups/templates";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "—";

const todayKey = () => new Date().toISOString().slice(0, 10);

const STATUS_BADGE: Record<
  Followup["status"],
  { tone: "neutral" | "good" | "warn" | "bad" | "brand"; label: string }
> = {
  pending: { tone: "warn", label: "Pending" },
  sent: { tone: "good", label: "Sent" },
  skipped: { tone: "neutral", label: "Skipped" },
  failed: { tone: "bad", label: "Failed" },
};

type Filter = "due" | "pending" | "sent" | "skipped" | "failed" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "due", label: "Due now" },
  { key: "pending", label: "Pending" },
  { key: "sent", label: "Sent" },
  { key: "skipped", label: "Skipped" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "All" },
];

export default function FollowupsPage() {
  const {
    followups,
    templates,
    loading,
    error,
    dueToday,
    pending,
    sentThisWeek,
    scanNow,
    sendNow,
    skip,
    requeue,
    saveTemplate,
  } = useFollowups();
  const { clients } = useClients();
  const { realRole } = useRole();
  const canWrite = realRole === "owner" || realRole === "bookkeeper" || realRole === "frontdesk";

  const [filter, setFilter] = useState<Filter>("due");
  const [showTemplates, setShowTemplates] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const clientName = useMemo(() => {
    const m = new Map(
      clients.map(
        (c) => [c.id, `${c.first_name} ${c.last_name}`.trim() || "Unnamed"] as const,
      ),
    );
    return (id: string | null) => (id ? m.get(id) ?? "Unknown client" : "No client");
  }, [clients]);
  // A row is sendable with an email OR a mobile (SMS) on file.
  const clientContact = useMemo(() => {
    const m = new Map(
      clients.map((c) => [c.id, { email: c.email, phone: c.phone }] as const),
    );
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [clients]);

  const failed = followups.filter((f) => f.status === "failed").length;

  const tk = todayKey();
  const filtered = useMemo(() => {
    const list = followups.filter((f) => {
      switch (filter) {
        case "due":
          return f.status === "pending" && f.scheduled_for !== null && f.scheduled_for <= tk;
        case "pending":
          return f.status === "pending";
        case "sent":
          return f.status === "sent";
        case "skipped":
          return f.status === "skipped";
        case "failed":
          return f.status === "failed";
        case "all":
        default:
          return true;
      }
    });
    return [...list].sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));
  }, [followups, filter, tk]);

  const runScan = async () => {
    setScanning(true);
    setMsg(null);
    const res = await scanNow();
    setScanning(false);
    setMsg(
      res.ok
        ? `Scan complete. ${res.enqueued ?? 0} new follow-up(s) queued.`
        : res.error || "Scan failed.",
    );
  };

  const doSend = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    const res = await sendNow(id);
    setBusyId(null);
    if (!res.ok) setMsg(res.error || "Send failed.");
  };
  const doSkip = async (id: string) => {
    setBusyId(id);
    await skip(id);
    setBusyId(null);
  };
  const doRequeue = async (id: string) => {
    setBusyId(id);
    await requeue(id);
    setBusyId(null);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow-ups</h1>
          <p className="text-sm text-black/50">
            Aftercare, review requests, and nudges — finished work turned into healed clients and reviews.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={runScan}
              disabled={scanning}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {scanning ? "Scanning…" : "Scan now"}
            </button>
            <button
              onClick={() => setShowTemplates((v) => !v)}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-black/60 hover:bg-black/4"
            >
              {showTemplates ? "Hide templates" : "Templates"}
            </button>
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Due now" value={String(dueToday)} accent tone={dueToday ? "warn" : "neutral"} sub="ready to send" />
        <StatCard label="Pending" value={String(pending)} sub="in the queue" />
        <StatCard label="Sent this week" value={String(sentThisWeek)} tone="good" sub="last 7 days" />
        <StatCard label="Failed" value={String(failed)} tone={failed ? "warn" : "neutral"} sub="need a retry" />
      </div>

      {/* How sending works — keep the domain-reputation guardrail visible. */}
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-black/10 bg-black/3 px-3 py-2 text-xs text-black/55">
        <span className="font-semibold text-black/70">Sending</span>
        <span>
          Use <span className="font-medium">Send now</span> to email a follow-up by hand at any time. Automated nightly
          sending stays off until the Resend sending domain is confirmed (set{" "}
          <code className="rounded bg-black/5 px-1">FOLLOWUPS_AUTOSEND=true</code>), so the queue fills safely in the
          meantime.
        </span>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-black/10 bg-black/3 px-3 py-2 text-xs text-black/60">{msg}</div>
      )}

      {showTemplates && canWrite && <TemplateEditor templates={templates} onSave={saveTemplate} />}

      {/* Filter segmented control */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f.key ? "bg-brand text-white" : "border border-black/10 text-black/55 hover:bg-black/4"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SectionTitle action={<span className="text-xs text-black/40">{filtered.length} shown</span>}>
        Queue
      </SectionTitle>

      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Loading follow-ups…</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-amber-600">{error}</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">
            {followups.length === 0
              ? "Nothing queued yet. Complete a booking, then run “Scan now.”"
              : "Nothing in this view."}
          </div>
        </Card>
      ) : (
        <Card className="divide-y divide-black/6 overflow-hidden">
          {filtered.map((f) => (
            <FollowupRow
              key={f.id}
              followup={f}
              clientName={clientName(f.client_id)}
              contact={clientContact(f.client_id)}
              canWrite={canWrite}
              busy={busyId === f.id}
              onSend={() => doSend(f.id)}
              onSkip={() => doSkip(f.id)}
              onRequeue={() => doRequeue(f.id)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function FollowupRow({
  followup: f,
  clientName,
  contact,
  canWrite,
  busy,
  onSend,
  onSkip,
  onRequeue,
}: {
  followup: Followup;
  clientName: string;
  contact: { email: string | null; phone: string | null } | null;
  canWrite: boolean;
  busy: boolean;
  onSend: () => void;
  onSkip: () => void;
  onRequeue: () => void;
}) {
  const status = STATUS_BADGE[f.status];
  const reachable = !!(contact?.email || contact?.phone);
  const contactLine = contact?.email || contact?.phone || "no email or mobile on file";
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-black/3">
      <div className="w-24 shrink-0">
        <div className="text-sm font-semibold">{fmtDate(f.scheduled_for)}</div>
        <div className="text-[11px] text-black/35">scheduled</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{clientName}</span>
          <Badge tone="brand">{KIND_LABEL[f.kind]}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          {f.channel === "sms" && <Badge tone="neutral">text</Badge>}
          {!reachable && <Badge tone="warn">No contact</Badge>}
        </div>
        <div className="mt-0.5 truncate text-xs text-black/45">
          {[contactLine, f.result && f.status !== "pending" ? f.result : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {canWrite && (
        <div className="flex shrink-0 items-center gap-1.5">
          {(f.status === "pending" || f.status === "failed") && (
            <button
              onClick={onSend}
              disabled={busy || !reachable}
              title={!reachable ? "No email or mobile on file for this client" : "Send now"}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
            >
              {busy ? "…" : "Send now"}
            </button>
          )}
          {f.status === "pending" && (
            <button
              onClick={onSkip}
              disabled={busy}
              className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-black/55 hover:bg-black/4 disabled:opacity-40"
            >
              Skip
            </button>
          )}
          {(f.status === "skipped" || f.status === "failed") && (
            <button
              onClick={onRequeue}
              disabled={busy}
              className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-black/55 hover:bg-black/4 disabled:opacity-40"
            >
              Re-queue
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  templates,
  onSave,
}: {
  templates: Template[];
  onSave: (t: {
    kind: FollowupKind;
    subject: string;
    body: string;
    lead_days: number;
    enabled: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  if (!templates.length) {
    return (
      <Card className="mb-5">
        <div className="px-4 py-8 text-center text-sm text-black/40">Loading templates…</div>
      </Card>
    );
  }
  return (
    <div className="mb-5 space-y-3">
      {templates.map((t) => (
        <TemplateCard key={t.kind} template={t} onSave={onSave} />
      ))}
    </div>
  );
}

const LEAD_LABEL: Partial<Record<FollowupKind, string>> = {
  review_request: "Days after the visit to send",
  rebook_nudge: "Days since last visit = lapsed",
};

function TemplateCard({
  template,
  onSave,
}: {
  template: Template;
  onSave: (t: {
    kind: FollowupKind;
    subject: string;
    body: string;
    lead_days: number;
    enabled: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [leadDays, setLeadDays] = useState(String(template.lead_days));
  const [enabled, setEnabled] = useState(template.enabled);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const leadLabel = LEAD_LABEL[template.kind];
  const input = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";

  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const res = await onSave({
      kind: template.kind,
      subject,
      body,
      lead_days: Math.max(0, parseInt(leadDays || "0", 10) || 0),
      enabled,
    });
    setBusy(false);
    if (res.ok) setSaved(true);
    else setErr(res.error || "Could not save.");
  };

  return (
    <Card>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{KIND_LABEL[template.kind]}</h3>
            <Badge tone={enabled ? "good" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
          </div>
          <label className="flex items-center gap-2 text-xs text-black/55">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSaved(false);
              }}
            />
            Enabled
          </label>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">Subject</span>
          <input
            className={input}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setSaved(false);
            }}
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">
            Body
            <span className="ml-1 normal-case text-black/35">
              — tokens: {"{{first_name}}"} {"{{shop_name}}"}
              {template.kind === "review_request" ? " {{review_link}}" : ""}
            </span>
          </span>
          <textarea
            className={`${input} min-h-44 resize-y font-mono text-[13px] leading-relaxed`}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(false);
            }}
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          {leadLabel && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">{leadLabel}</span>
              <input
                className={`${input} w-28`}
                value={leadDays}
                inputMode="numeric"
                onChange={(e) => {
                  setLeadDays(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          )}
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save template"}
          </button>
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
          {err && <span className="text-xs text-rose-600">{err}</span>}
        </div>
      </div>
    </Card>
  );
}
