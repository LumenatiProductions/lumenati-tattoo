"use client";

import { TabHeader } from "@/components/admin/tabs";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import type { FollowupKind } from "@/lib/followups/templates";
import {
  Card,
  Empty,
  SectionTitle,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/admin/ui";

// The Sending page: every automatic message the shop sends, each with its own
// switch. Wording for each stream lives here; the switches and timing write
// through /api/messaging/streams (the same knobs the nightly jobs read).

type ClientStream = {
  kind: FollowupKind;
  label: string;
  enabled: boolean;
  lead_days: number;
  sent30: number;
};

type ArtistStream = {
  stream: "rent_nudges" | "weekly_summary";
  label: string;
  enabled: boolean;
};

const WHAT_IT_DOES: Record<FollowupKind, string> = {
  reminder_48h: "An early heads-up so the appointment is not forgotten.",
  reminder_24h: "A final reminder the day before, with a confirm option.",
  aftercare: "Care instructions the moment a visit is closed out.",
  review_request: "Asks a happy client for a public review.",
  healed_photo: "Asks for a healed photo for the artist's portfolio.",
  rebook_nudge: "Invites a client back after a stretch away.",
  birthday: "A birthday hello with a nudge to book.",
};

// How each kind's timing reads. Reminders count days BEFORE the visit;
// review and healed-photo count days AFTER it; the rebook nudge counts days
// since the last visit. Aftercare and birthday have fixed timing.
const TIMING: Record<FollowupKind, { fixed?: string; suffix?: string }> = {
  reminder_48h: { suffix: "days before the visit" },
  reminder_24h: { suffix: "days before the visit" },
  aftercare: { fixed: "Right after the visit" },
  review_request: { suffix: "days after the visit" },
  healed_photo: { suffix: "days after the visit" },
  rebook_nudge: { suffix: "days without a visit" },
  birthday: { fixed: "On their birthday" },
};

const ARTIST_WHAT: Record<ArtistStream["stream"], string> = {
  rent_nudges:
    "Reminds a renter when rent is ready, when it is due, then a firmer note each week it stays open.",
  weekly_summary: "A Sunday recap of each artist's week: earnings, clients, rebooks.",
};

function Toggle({
  on,
  busy,
  label,
  onFlip,
}: {
  on: boolean;
  busy: boolean;
  label: string;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onFlip}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-emerald-500/80" : "bg-white/15"
      } ${busy ? "opacity-50" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

// Timing cell: a small number that saves on blur, or fixed wording.
function LeadDays({
  kind,
  value,
  onSave,
}: {
  kind: FollowupKind;
  value: number;
  onSave: (days: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(String(value));
  const t = TIMING[kind];
  useEffect(() => setDraft(String(value)), [value]);

  if (t.fixed) return <span className="text-white/70">{t.fixed}</span>;

  const commit = async () => {
    const n = Math.max(0, parseInt(draft || "0", 10) || 0);
    if (n === value) {
      setDraft(String(value));
      return;
    }
    const ok = await onSave(n);
    if (!ok) setDraft(String(value));
  };

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className="w-14 rounded-md border border-white/12 bg-white/6 px-2 py-1 text-sm"
        aria-label={`Days for ${kind}`}
      />
      <span className="text-white/60">{t.suffix}</span>
    </span>
  );
}

export default function SendingPage() {
  const { realRole } = useRole();

  const [clientStreams, setClientStreams] = useState<ClientStream[] | null>(null);
  const [artistStreams, setArtistStreams] = useState<ArtistStream[] | null>(null);
  const [masterOn, setMasterOn] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/messaging/streams");
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) {
          setMsg(d.error || "Could not load the switches.");
          setClientStreams([]);
          setArtistStreams([]);
        } else {
          setClientStreams(d.clientStreams ?? []);
          setArtistStreams(d.artistStreams ?? []);
          setMasterOn(!!d.masterOn);
        }
      } catch {
        if (alive) {
          setMsg("Connection problem, try again.");
          setClientStreams([]);
          setArtistStreams([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const patch = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      const r = await fetch("/api/messaging/streams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setMsg(d.error || "Could not save that change.");
        return false;
      }
      setMsg(null);
      return true;
    } catch {
      setMsg("Connection problem, try again.");
      return false;
    }
  };

  // Optimistic flip with rollback on failure.
  const flipKind = async (kind: FollowupKind) => {
    const row = clientStreams?.find((s) => s.kind === kind);
    if (!row) return;
    const next = !row.enabled;
    setBusyKey(kind);
    setClientStreams((s) => s!.map((r) => (r.kind === kind ? { ...r, enabled: next } : r)));
    const ok = await patch({ kind, enabled: next });
    if (!ok) {
      setClientStreams((s) => s!.map((r) => (r.kind === kind ? { ...r, enabled: !next } : r)));
    }
    setBusyKey(null);
  };

  const saveLead = async (kind: FollowupKind, days: number): Promise<boolean> => {
    const ok = await patch({ kind, lead_days: days });
    if (ok) {
      setClientStreams((s) => s!.map((r) => (r.kind === kind ? { ...r, lead_days: days } : r)));
    }
    return ok;
  };

  const flipStream = async (stream: ArtistStream["stream"]) => {
    const row = artistStreams?.find((s) => s.stream === stream);
    if (!row) return;
    const next = !row.enabled;
    setBusyKey(stream);
    setArtistStreams((s) => s!.map((r) => (r.stream === stream ? { ...r, enabled: next } : r)));
    const ok = await patch({ stream, enabled: next });
    if (!ok) {
      setArtistStreams((s) => s!.map((r) => (r.stream === stream ? { ...r, enabled: !next } : r)));
    }
    setBusyKey(null);
  };

  if (realRole !== "owner") {
    return (
      <div>
        <TabHeader title="Sending" subtitle="Every automatic message the shop sends, and the switches." />
        <Empty>Admins only.</Empty>
      </div>
    );
  }

  const loading = clientStreams === null || artistStreams === null;

  return (
    <div>
      <TabHeader
        title="Sending"
        subtitle="Every automatic message the shop sends, and the switches."
      />

      {/* Master status, in plain English. */}
      <Card className="mb-5">
        <div className="flex items-start gap-3 p-4">
          <span
            className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              masterOn ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <div>
            <div className="text-sm font-semibold">
              {masterOn ? "Automatic sending is on" : "Automatic sending is paused"}
            </div>
            <div className="mt-0.5 text-xs text-white/65">
              {masterOn
                ? "Everything switched on below goes out on its own schedule."
                : "The queues below still fill safely, but nothing goes out on its own until texting approval is finished and sending is switched on. Manual sends from the Queue tab still work."}
            </div>
          </div>
        </div>
      </Card>

      {msg && (
        <div className="mb-4 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-amber-300">
          {msg}
        </div>
      )}

      <SectionTitle>To clients</SectionTitle>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Card className="mb-6 overflow-x-auto">
          <Table>
            <THead>
              <Th>Message</Th>
              <Th>What it does</Th>
              <Th>Timing</Th>
              <Th className="text-right">Sent, last 30 days</Th>
              <Th className="text-right">On</Th>
            </THead>
            <tbody>
              {clientStreams!.map((s) => (
                <Tr key={s.kind} className={s.enabled ? "" : "opacity-60"}>
                  <Td className="whitespace-nowrap font-medium">{s.label}</Td>
                  <Td className="text-white/70">{WHAT_IT_DOES[s.kind]}</Td>
                  <Td>
                    <LeadDays kind={s.kind} value={s.lead_days} onSave={(n) => saveLead(s.kind, n)} />
                  </Td>
                  <Td className="tnum text-right">{s.sent30}</Td>
                  <Td className="text-right">
                    <Toggle
                      on={s.enabled}
                      busy={busyKey === s.kind}
                      label={`Turn ${s.label} on or off`}
                      onFlip={() => flipKind(s.kind)}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <SectionTitle>To artists</SectionTitle>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : (
        <Card className="divide-y divide-white/9 overflow-hidden">
          {artistStreams!.map((s) => (
            <div key={s.stream} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className={s.enabled ? "" : "opacity-60"}>
                <div className="text-sm font-medium">{s.label}</div>
                <div className="mt-0.5 text-xs text-white/65">{ARTIST_WHAT[s.stream]}</div>
              </div>
              <Toggle
                on={s.enabled}
                busy={busyKey === s.stream}
                label={`Turn ${s.label} on or off`}
                onFlip={() => flipStream(s.stream)}
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
