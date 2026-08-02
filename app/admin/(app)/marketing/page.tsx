"use client";

import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import {
  Badge,
  Card,
  Empty,
  FilterChips,
  PageHeader,
  SectionTitle,
  StatCard,
  StatRow,
} from "@/components/admin/ui";

// The Marketing page: pick a group, write one message, send it once. Segments
// and consent are computed server-side (/api/marketing/segments); only clients
// who said yes to marketing on the booking form are ever reachable.

type Segment = {
  key: string;
  label: string;
  total: number;
  textable: number;
  emailable: number;
};

type Blast = {
  id: string;
  channel: "email" | "sms";
  segment: string;
  subject: string | null;
  body: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
};

type Channel = "email" | "sms";

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "sms", label: "Text" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function MarketingPage() {
  const { realRole } = useRole();

  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [blasts, setBlasts] = useState<Blast[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [segment, setSegment] = useState("all");
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      const r = await fetch("/api/marketing/blast");
      const d = await r.json().catch(() => ({}));
      setBlasts(r.ok ? (d.blasts ?? []) : []);
    } catch {
      setBlasts([]);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/marketing/segments");
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) {
          setLoadErr(d.error || "Could not load the client list.");
          setSegments([]);
        } else {
          setSegments(d.segments ?? []);
        }
      } catch {
        if (alive) {
          setLoadErr("Connection problem, try again.");
          setSegments([]);
        }
      }
    })();
    loadHistory();
    return () => {
      alive = false;
    };
  }, []);

  const segLabel = useMemo(() => {
    const m = new Map((segments ?? []).map((s) => [s.key, s.label] as const));
    return (key: string) => m.get(key) ?? key;
  }, [segments]);

  const current = segments?.find((s) => s.key === segment);
  const reachCount = current ? (channel === "sms" ? current.textable : current.emailable) : 0;

  const allSeg = segments?.find((s) => s.key === "all");
  const nobodyConsented = !!allSeg && allSeg.textable === 0 && allSeg.emailable === 0;

  const ready =
    !!body.trim() && (channel === "sms" || !!subject.trim()) && reachCount > 0 && !sending;

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const r = await fetch("/api/marketing/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          segment,
          subject: channel === "email" ? subject : undefined,
          body,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setResult(d.error || "Send failed.");
      } else {
        const bits = [`Sent to ${d.sent ?? 0} ${d.sent === 1 ? "person" : "people"}.`];
        if (d.failed) bits.push(`${d.failed} failed.`);
        if (d.skipped) bits.push(`${d.skipped} skipped (no permission or no contact info).`);
        if (d.note) bits.push(d.note);
        setResult(bits.join(" "));
        if (d.sent) {
          setBody("");
          setSubject("");
        }
        await loadHistory();
      }
    } catch {
      setResult("Connection problem, try again.");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  if (realRole !== "owner") {
    return (
      <div>
        <PageHeader title="Marketing" subtitle="Reach the shop's client list." />
        <Empty>Admins only.</Empty>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Marketing"
        subtitle="Reach the shop's client list: one message to a group, sent once."
      />

      <StatRow>
        {(segments ?? []).map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={String(s.total)}
            accent={s.key === "all"}
            sub={`${s.textable} reachable by text · ${s.emailable} by email`}
          />
        ))}
        {!segments &&
          ["All clients", "Birthdays this month", "Due to rebook", "Lapsed"].map((l) => (
            <StatCard key={l} label={l} value="·" sub="loading" />
          ))}
      </StatRow>

      {loadErr && (
        <div className="mb-4 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-amber-300">
          {loadErr}
        </div>
      )}

      {nobodyConsented && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/70">
          <span className="font-semibold text-white/85">Nobody has opted in yet</span>
          <span>
            Clients say yes to marketing on the booking form when they request an appointment.
            As requests come in, this list fills up on its own.
          </span>
        </div>
      )}

      <SectionTitle>Compose</SectionTitle>
      <Card className="mb-6">
        <div className="p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/60">Send to</div>
          <FilterChips
            filters={(segments ?? []).map((s) => ({ key: s.key, label: s.label }))}
            value={segment}
            onChange={(k) => {
              setSegment(k);
              setConfirming(false);
            }}
          />

          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/60">How</div>
          <FilterChips
            filters={CHANNELS}
            value={channel}
            onChange={(k) => {
              setChannel(k);
              setConfirming(false);
            }}
          />

          {channel === "email" && (
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/60">
                Subject
              </span>
              <input
                className={input}
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setConfirming(false);
                }}
                placeholder="What the email is about"
              />
            </label>
          )}

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/60">
              Message
            </span>
            <textarea
              className={`${input} min-h-32 resize-y`}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setConfirming(false);
              }}
              placeholder={
                channel === "sms"
                  ? "Keep it short. The shop's name and an opt-out line are added automatically."
                  : "Plain text. It goes out exactly as written."
              }
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={!ready}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Send blast
              </button>
            ) : (
              <>
                <button
                  onClick={send}
                  disabled={sending}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {sending
                    ? "Sending…"
                    : `Yes, send to ${reachCount} ${reachCount === 1 ? "person" : "people"}`}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={sending}
                  className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/6 disabled:opacity-40"
                >
                  Cancel
                </button>
              </>
            )}
            <span className="text-xs text-white/60">
              {confirming
                ? `This ${channel === "sms" ? "text" : "email"} goes to ${reachCount} ${
                    reachCount === 1 ? "person" : "people"
                  } in ${segLabel(segment)}. It cannot be unsent.`
                : `${reachCount} ${reachCount === 1 ? "person" : "people"} in ${segLabel(segment)} can get this by ${
                    channel === "sms" ? "text" : "email"
                  }.`}
            </span>
          </div>

          {result && (
            <div className="mt-3 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/75">
              {result}
            </div>
          )}
        </div>
      </Card>

      <SectionTitle
        action={
          blasts?.length ? <span className="text-xs text-white/55">{blasts.length} shown</span> : undefined
        }
      >
        Sent
      </SectionTitle>
      {blasts === null ? (
        <Empty>Loading history…</Empty>
      ) : blasts.length === 0 ? (
        <Empty>No blasts sent yet. The ones you send show up here.</Empty>
      ) : (
        <Card className="divide-y divide-white/9 overflow-hidden">
          {blasts.map((bl) => (
            <div key={bl.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-24 shrink-0">
                <div className="text-sm font-semibold">{fmtDate(bl.created_at)}</div>
                <div className="text-[11px] text-white/50">sent</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {bl.subject || bl.body.slice(0, 60)}
                  </span>
                  <Badge tone="neutral">{bl.channel === "sms" ? "text" : "email"}</Badge>
                  <Badge tone="neutral">{segLabel(bl.segment)}</Badge>
                </div>
                <div className="mt-0.5 truncate text-xs text-white/60">
                  {[
                    `${bl.sent_count} sent`,
                    bl.failed_count ? `${bl.failed_count} failed` : null,
                    bl.skipped_count ? `${bl.skipped_count} skipped` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
