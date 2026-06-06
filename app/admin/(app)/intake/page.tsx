"use client";

import { useMemo, useState } from "react";
import { useIntake, type ConsentForm, type FormPatch } from "@/lib/admin/intake-context";
import { useClients } from "@/lib/admin/clients-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useBookings } from "@/lib/admin/bookings-context";
import { useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";
import { ID_TYPES, MEDICAL_QUESTIONS, SIGNATURE_VIEWBOX, type IdType } from "@/lib/intake/forms";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const isToday = (iso: string | null) => !!iso && dayKey(iso) === new Date().toISOString().slice(0, 10);

// Derived state of a form, for the badge + filtering.
type FormState = "complete" | "awaiting_id" | "awaiting_sign" | "voided" | "age_flag";

function stateOf(f: ConsentForm): FormState {
  if (f.voided) return "voided";
  if (f.age_ok === false) return "age_flag";
  if (!f.signed_at) return "awaiting_sign";
  if (!f.id_checked) return "awaiting_id";
  return "complete";
}

const STATE_BADGE: Record<FormState, { tone: "neutral" | "good" | "warn" | "bad" | "brand"; label: string }> = {
  complete: { tone: "good", label: "Signed + ID checked" },
  awaiting_id: { tone: "warn", label: "Needs ID check" },
  awaiting_sign: { tone: "warn", label: "Awaiting signature" },
  age_flag: { tone: "bad", label: "Under-age — review" },
  voided: { tone: "neutral", label: "Voided" },
};

type Filter = "incomplete" | "today" | "signed" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "incomplete", label: "Needs attention" },
  { key: "today", label: "Today" },
  { key: "signed", label: "Signed" },
  { key: "all", label: "All" },
];

export default function IntakePage() {
  const { forms, loading, error, unsignedToday, createForm, updateForm, voidForm, sendLink, signUrlFor } = useIntake();
  const { clients } = useClients();
  const { artists } = useArtists();
  const { bookings } = useBookings();
  const { realRole } = useRole();
  const canWrite = realRole === "owner" || realRole === "bookkeeper" || realRole === "frontdesk";

  const [filter, setFilter] = useState<Filter>("incomplete");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<string | null>(null);

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim() || "Unnamed"] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown client" : "No client linked");
  }, [clients]);
  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : "Any artist");
  }, [artists]);

  const filtered = useMemo(() => {
    return forms.filter((f) => {
      const s = stateOf(f);
      switch (filter) {
        case "incomplete":
          return s === "awaiting_sign" || s === "awaiting_id" || s === "age_flag";
        case "today":
          return isToday(f.created_at) || isToday(f.signed_at);
        case "signed":
          return !!f.signed_at && !f.voided;
        case "all":
        default:
          return true;
      }
    });
  }, [forms, filter]);

  // Stats.
  const signedToday = forms.filter((f) => isToday(f.signed_at) && !f.voided).length;
  const awaitingSign = forms.filter((f) => !f.signed_at && !f.voided).length;
  const awaitingId = forms.filter((f) => f.signed_at && !f.id_checked && !f.voided).length;

  const selected = forms.find((f) => f.id === selectedId) ?? null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intake &amp; Consent</h1>
          <p className="text-sm text-black/50">
            Digital waivers, age/ID verification, and aftercare sign-off — on file before the needle touches skin.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => {
              setAdding((v) => !v);
              setFreshLink(null);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            {adding ? "Close" : "New form"}
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Unsigned today" value={String(unsignedToday)} accent tone={unsignedToday ? "warn" : "good"} sub="today's bookings w/o a form" />
        <StatCard label="Signed today" value={String(signedToday)} tone="good" sub="completed forms" />
        <StatCard label="Awaiting signature" value={String(awaitingSign)} tone={awaitingSign ? "warn" : "neutral"} sub="links sent / tablet pending" />
        <StatCard label="Needs ID check" value={String(awaitingId)} tone={awaitingId ? "warn" : "neutral"} sub="signed, ID not confirmed" />
      </div>

      {adding && canWrite && (
        <NewFormPanel
          clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || "Unnamed" }))}
          artists={artists.map((a) => ({ id: a.id, name: a.name }))}
          bookings={bookings
            .filter((b) => b.status === "scheduled")
            .map((b) => ({
              id: b.id,
              label: `${fmtDateTime(b.starts_at)} · ${clientName(b.client_id)}`,
              clientId: b.client_id,
              artistId: b.artist_id,
            }))}
          onCancel={() => {
            setAdding(false);
            setFreshLink(null);
          }}
          onCreate={async (input) => {
            const res = await createForm(input);
            if (res.ok && res.signUrl) setFreshLink(res.signUrl);
            return res;
          }}
          freshLink={freshLink}
        />
      )}

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
        Consent forms
      </SectionTitle>

      {loading ? (
        <Card><div className="px-4 py-10 text-center text-sm text-black/40">Loading forms…</div></Card>
      ) : error ? (
        <Card><div className="px-4 py-10 text-center text-sm text-amber-600">{error}</div></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">
            {forms.length === 0
              ? "No consent forms yet. Start one above — fill it on the shop tablet or text the client a link."
              : "Nothing in this view."}
          </div>
        </Card>
      ) : (
        <Card className="divide-y divide-black/6 overflow-hidden">
          {filtered.map((f) => (
            <FormRow
              key={f.id}
              form={f}
              clientName={clientName(f.client_id)}
              artistName={artistName(f.artist_id)}
              onOpen={() => setSelectedId(f.id)}
            />
          ))}
        </Card>
      )}

      {selected && (
        <FormDrawer
          form={selected}
          clientName={clientName(selected.client_id)}
          artistName={artistName(selected.artist_id)}
          artists={artists.map((a) => ({ id: a.id, name: a.name }))}
          canWrite={canWrite}
          signUrl={signUrlFor(selected)}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => updateForm(selected.id, patch)}
          onVoid={(reason) => voidForm(selected.id, reason)}
          onSend={(to) => sendLink(selected.id, to)}
        />
      )}
    </div>
  );
}

function FormRow({
  form: f,
  clientName,
  artistName,
  onOpen,
}: {
  form: ConsentForm;
  clientName: string;
  artistName: string;
  onOpen: () => void;
}) {
  const s = stateOf(f);
  const badge = STATE_BADGE[s];
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{clientName}</span>
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {f.id_checked && f.id_type && <Badge tone="neutral">ID: {idTypeLabel(f.id_type)}</Badge>}
        </div>
        <div className="mt-0.5 truncate text-xs text-black/45">
          {[
            artistName,
            f.placement || null,
            f.signed_at ? `Signed ${fmtDate(f.signed_at)}` : `Started ${fmtDate(f.created_at)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <span className="shrink-0 text-xs text-black/30">View</span>
    </button>
  );
}

function NewFormPanel({
  clients,
  artists,
  bookings,
  onCreate,
  onCancel,
  freshLink,
}: {
  clients: { id: string; name: string }[];
  artists: { id: string; name: string }[];
  bookings: { id: string; label: string; clientId: string | null; artistId: string | null }[];
  onCreate: (input: { bookingId?: string | null; clientId?: string | null; artistId?: string | null; placement?: string }) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
  freshLink: string | null;
}) {
  const [f, setF] = useState({ bookingId: "", clientId: "", artistId: "", placement: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const input = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";

  // Picking a booking pre-fills client + artist.
  const pickBooking = (id: string) => {
    const bk = bookings.find((b) => b.id === id);
    setF((s) => ({
      ...s,
      bookingId: id,
      clientId: bk?.clientId ?? s.clientId,
      artistId: bk?.artistId ?? s.artistId,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await onCreate({
      bookingId: f.bookingId || null,
      clientId: f.clientId || null,
      artistId: f.artistId || null,
      placement: f.placement || undefined,
    });
    setBusy(false);
    if (!res.ok) setErr(res.error || "Could not start that form.");
  };

  return (
    <Card className="mb-5">
      {freshLink ? (
        <div className="p-4">
          <div className="text-sm font-semibold">Form ready — share the signing link</div>
          <p className="mt-1 text-xs text-black/50">
            Open it on the shop tablet for the client to sign now, or text/email it so they can fill it before they arrive.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input readOnly value={freshLink} className={`${input} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(freshLink);
                setCopied(true);
              }}
              className="shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/4"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={freshLink}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
            >
              Open
            </a>
          </div>
          <button type="button" onClick={onCancel} className="mt-4 text-xs font-medium text-black/45 hover:text-black/70">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Labeled label="Link to booking (optional)">
            <select className={input} value={f.bookingId} onChange={(e) => pickBooking(e.target.value)}>
              <option value="">No booking — walk-in</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Placement (body area)">
            <input className={input} value={f.placement} onChange={(e) => setF((s) => ({ ...s, placement: e.target.value }))} placeholder="Left forearm, ribs…" />
          </Labeled>
          <Labeled label="Client">
            <select className={input} value={f.clientId} onChange={(e) => setF((s) => ({ ...s, clientId: e.target.value }))}>
              <option value="">Unassigned</option>
              {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </Labeled>
          <Labeled label="Artist">
            <select className={input} value={f.artistId} onChange={(e) => setF((s) => ({ ...s, artistId: e.target.value }))}>
              <option value="">Any artist</option>
              {artists.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </Labeled>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? "Starting…" : "Start form"}
            </button>
            <button type="button" onClick={onCancel} className="rounded-lg border border-black/10 px-4 py-2 text-sm text-black/55">Cancel</button>
            {err && <span className="text-xs text-rose-600">{err}</span>}
          </div>
        </form>
      )}
    </Card>
  );
}

function FormDrawer({
  form: f,
  clientName,
  artistName,
  artists,
  canWrite,
  signUrl,
  onClose,
  onSave,
  onVoid,
  onSend,
}: {
  form: ConsentForm;
  clientName: string;
  artistName: string;
  artists: { id: string; name: string }[];
  canWrite: boolean;
  signUrl: string | null;
  onClose: () => void;
  onSave: (patch: FormPatch) => Promise<{ ok: boolean; error?: string }>;
  onVoid: (reason: string) => Promise<{ ok: boolean; error?: string }>;
  onSend: (to: string) => Promise<{ ok: boolean; error?: string; signUrl?: string; preview?: boolean }>;
}) {
  const s = stateOf(f);
  const badge = STATE_BADGE[s];
  const [idType, setIdType] = useState<IdType | "">(f.id_type ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [to, setTo] = useState("");

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    setMsg(res.ok ? okMsg : res.error || "Something went wrong.");
  };

  const confirmId = () =>
    run(() => onSave({ idChecked: true, idType: idType || null }), "ID confirmed.");

  const send = async () => {
    if (!to.includes("@")) {
      setMsg("Enter a valid email.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await onSend(to);
    setBusy(false);
    if (!res.ok) setMsg(res.error || "Could not send.");
    else if (res.preview) setMsg("Email isn't configured — copy the link below and text it instead.");
    else setMsg(`Sent to ${to}.`);
  };

  const doVoid = () => {
    const reason = window.prompt("Void this consent form? Add a short reason (kept for the record):");
    if (reason === null) return;
    run(() => onVoid(reason), "Form voided.");
  };

  const answers = f.answers || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{clientName}</h2>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-black/45 hover:bg-black/5">Close</button>
        </div>

        <div className="space-y-5 p-5">
          {f.age_ok === false && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Date of birth is below the minimum age. Do not proceed without front-desk review / guardian consent.
            </div>
          )}

          {/* Summary */}
          <Field label="Artist" value={artistName} />
          <Field label="Placement" value={f.placement || "—"} />
          <Field label="Signed name" value={f.signed_name || "—"} />
          <Field label="Date of birth" value={`${fmtDate(f.dob)}${f.age_ok === true ? " · age OK" : ""}`} />
          <Field label="Signed at" value={fmtDateTime(f.signed_at)} />
          {f.created_by && <Field label="Started by" value={f.created_by} />}

          {/* Signature */}
          {f.signature_svg && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-black/45">Signature</div>
              <div className="rounded-lg border border-black/10 bg-black/2 p-2">
                <svg viewBox={`0 0 ${SIGNATURE_VIEWBOX.w} ${SIGNATURE_VIEWBOX.h}`} className="h-24 w-full" role="img" aria-label="Signature">
                  <path d={f.signature_svg} fill="none" stroke="#0e0e11" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          )}

          {/* Medical flags */}
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-black/45">Medical flags</div>
            {f.medical_flags ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{f.medical_flags}</div>
            ) : f.signed_at ? (
              <div className="text-xs text-black/45">None reported.</div>
            ) : (
              <div className="text-xs text-black/35">Not yet completed.</div>
            )}
          </div>

          {/* Full questionnaire snapshot */}
          {f.signed_at && (
            <details className="rounded-lg border border-black/8">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-black/55">Full questionnaire</summary>
              <div className="space-y-1.5 px-3 pb-3 pt-1">
                {MEDICAL_QUESTIONS.map((q) => (
                  <div key={q.key} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-black/55">{q.label.replace(/^PLACEHOLDER —\s*/, "")}</span>
                    <span className={`shrink-0 font-medium ${String(answers[q.key]).toLowerCase() === "yes" ? "text-amber-700" : "text-black/45"}`}>
                      {String(answers[q.key] ?? "—")}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                  <span className="text-black/55">Aftercare acknowledged</span>
                  <span className="font-medium text-emerald-700">{f.aftercare_ack ? "Yes" : "No"}</span>
                </div>
              </div>
            </details>
          )}

          {/* Actions */}
          {canWrite && !f.voided && (
            <div className="space-y-4 border-t border-black/8 pt-4">
              {/* Not yet signed: share the link */}
              {!f.signed_at && signUrl && (
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-black/45">Signing link</div>
                  <div className="flex items-center gap-2">
                    <input readOnly value={signUrl} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 font-mono text-xs" />
                    <a href={signUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">Open</a>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@email.com" className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
                    <button onClick={send} disabled={busy} className="shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/4 disabled:opacity-40">Email link</button>
                  </div>
                </div>
              )}

              {/* Signed: confirm the in-person ID check */}
              {f.signed_at && (
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-black/45">ID verification</div>
                  {f.id_checked ? (
                    <div className="text-xs text-emerald-700">Confirmed{f.id_type ? ` · ${idTypeLabel(f.id_type)}` : ""}.</div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select value={idType} onChange={(e) => setIdType(e.target.value as IdType)} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                        <option value="">ID type…</option>
                        {ID_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                      </select>
                      <button onClick={confirmId} disabled={busy || !idType} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Confirm ID checked</button>
                    </div>
                  )}
                </div>
              )}

              <button onClick={doVoid} disabled={busy} className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-40">
                Void this form
              </button>
            </div>
          )}

          {f.voided && (
            <div className="rounded-lg border border-black/8 bg-black/2 px-3 py-2 text-xs text-black/55">
              Voided{f.void_reason ? ` — ${f.void_reason}` : ""}. Kept on file for the record.
            </div>
          )}

          {msg && <div className="text-xs text-black/55">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-black/45">{label}</span>
      <span className="text-sm text-black/80">{value}</span>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">{label}</span>
      {children}
    </label>
  );
}

function idTypeLabel(t: IdType) {
  return ID_TYPES.find((x) => x.value === t)?.label ?? t;
}
