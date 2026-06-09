"use client";

import { useMemo, useState } from "react";
import {
  useBookings,
  type Booking,
  type BookingPatch,
  type BookingStatus,
} from "@/lib/admin/bookings-context";
import { useClients } from "@/lib/admin/clients-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle, StatCard, Badge, Dot } from "@/components/admin/ui";
import RequestsInbox from "@/components/admin/RequestsInbox";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const fmtDayLong = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isToday = (iso: string) => dayKey(iso) === dayKey(new Date().toISOString());

const STATUS_BADGE: Record<BookingStatus, { tone: "neutral" | "good" | "warn" | "bad" | "brand"; label: string }> = {
  scheduled: { tone: "brand", label: "Scheduled" },
  completed: { tone: "good", label: "Completed" },
  no_show: { tone: "bad", label: "No-show" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

const DEPOSIT_BADGE: Record<string, { tone: "neutral" | "good" | "warn" | "bad"; label: string } | null> = {
  none: null,
  held: { tone: "warn", label: "Deposit held" },
  applied: { tone: "good", label: "Deposit applied" },
  forfeited: { tone: "bad", label: "Deposit forfeited" },
  refunded: { tone: "neutral", label: "Deposit refunded" },
};

type Filter = "today" | "upcoming" | "review" | "past" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "review", label: "Needs review" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

export default function BookingsPage() {
  const { bookings, loading, error, today, depositsHeld, addBooking, updateBooking, syncFromSquare } =
    useBookings();
  const { clients } = useClients();
  const { artists } = useArtists();
  const { realRole } = useRole();
  const canWrite = realRole === "owner" || realRole === "bookkeeper" || realRole === "frontdesk";
  const canSync = realRole === "owner";

  const [filter, setFilter] = useState<Filter>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim() || "Unnamed"] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown client" : "No client");
  }, [clients]);
  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : "Any artist");
  }, [artists]);
  const artistColor = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.color] as const));
    return (id: string | null) => (id ? m.get(id) ?? "#999" : "#bbb");
  }, [artists]);

  const nowMs = Date.now();
  const filtered = useMemo(() => {
    const list = bookings.filter((b) => {
      const t = new Date(b.starts_at).getTime();
      switch (filter) {
        case "today":
          return isToday(b.starts_at) && b.status !== "cancelled";
        case "upcoming":
          return t >= nowMs && b.status === "scheduled";
        case "review":
          return b.status === "no_show";
        case "past":
          return t < nowMs;
        case "all":
        default:
          return true;
      }
    });
    // Past views read newest-first; forward views read soonest-first.
    const asc = filter === "today" || filter === "upcoming";
    return [...list].sort((a, b) =>
      asc
        ? a.starts_at.localeCompare(b.starts_at)
        : b.starts_at.localeCompare(a.starts_at),
    );
  }, [bookings, filter, nowMs]);

  // Group the filtered list by calendar day for the agenda.
  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of filtered) {
      const k = dayKey(b.starts_at);
      (m.get(k) ?? m.set(k, []).get(k)!).push(b);
    }
    return [...m.entries()];
  }, [filtered]);

  // Window-wide stats.
  const settled = bookings.filter((b) => b.status === "completed" || b.status === "no_show").length;
  const noShows = bookings.filter((b) => b.status === "no_show").length;
  const noShowRate = settled ? Math.round((noShows / settled) * 100) : 0;
  const forfeited = bookings
    .filter((b) => b.deposit_status === "forfeited")
    .reduce((s, b) => s + b.deposit_cents, 0);
  const fromSquare = bookings.some((b) => b.source === "square");

  const selected = bookings.find((b) => b.id === selectedId) ?? null;

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const res = await syncFromSquare();
    setSyncing(false);
    setSyncMsg(
      res.ok
        ? `Synced from Square. ${res.mirrored ?? 0} mirrored, ${res.autoFlaggedNoShow ?? 0} flagged no-show.`
        : res.error || "Sync failed.",
    );
    // Success notices clear themselves; an error stays until the next attempt.
    if (res.ok) setTimeout(() => setSyncMsg(null), 8000);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="text-sm text-black/50">
            The calendar where the day runs — and where deposits get applied or forfeited.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdding((v) => !v)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              {adding ? "Close" : "New booking"}
            </button>
            {canSync && (
              <button
                onClick={runSync}
                disabled={syncing}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-black/60 hover:bg-black/4 disabled:opacity-40"
              >
                {syncing ? "Syncing…" : "Sync from Square"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today" value={String(today)} accent sub="appointments" />
        <StatCard label="Deposits held" value={money(depositsHeld)} tone={depositsHeld ? "warn" : "neutral"} sub="awaiting outcome" />
        <StatCard label="No-show rate" value={`${noShowRate}%`} tone={noShowRate >= 15 ? "warn" : "neutral"} sub={`${noShows} of ${settled} settled`} />
        <StatCard label="Forfeited" value={money(forfeited)} sub="kept from no-shows" />
      </div>

      {syncMsg && (
        <div className="mb-4 rounded-lg border border-black/10 bg-black/3 px-3 py-2 text-xs text-black/60">
          {syncMsg}
        </div>
      )}

      {canWrite && <RequestsInbox />}

      {adding && canWrite && (
        <AddForm
          clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || "Unnamed" }))}
          artists={artists.map((a) => ({ id: a.id, name: a.name }))}
          onCancel={() => setAdding(false)}
          onAdd={async (input) => {
            const res = await addBooking(input);
            if (res.ok) {
              setAdding(false);
              if (res.booking) setSelectedId(res.booking.id);
            }
            return res;
          }}
        />
      )}

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
        Agenda
      </SectionTitle>

      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Loading bookings…</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-amber-600">{error}</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">
            {bookings.length === 0
              ? "No bookings yet. Add one above, or sync from Square."
              : "Nothing in this view."}
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold">{fmtDayLong(items[0].starts_at)}</h3>
                {dayKey(items[0].starts_at) === dayKey(new Date().toISOString()) && (
                  <span className="text-xs font-medium text-brand">Today</span>
                )}
                <span className="text-xs text-black/35">{items.length}</span>
              </div>
              <Card className="divide-y divide-black/6 overflow-hidden">
                {items.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    clientName={clientName(b.client_id)}
                    artistName={artistName(b.artist_id)}
                    artistColor={artistColor(b.artist_id)}
                    canWrite={canWrite}
                    onOpen={() => setSelectedId(b.id)}
                    onComplete={() => updateBooking(b.id, { status: "completed" })}
                    onNoShow={() => updateBooking(b.id, { status: "no_show" })}
                  />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <BookingDrawer
          booking={selected}
          clientName={clientName(selected.client_id)}
          artists={artists.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
          clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() || "Unnamed" }))}
          canWrite={canWrite}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => updateBooking(selected.id, patch)}
        />
      )}
    </div>
  );
}

function BookingRow({
  booking: b,
  clientName,
  artistName,
  artistColor,
  canWrite,
  onOpen,
  onComplete,
  onNoShow,
}: {
  booking: Booking;
  clientName: string;
  artistName: string;
  artistColor: string;
  canWrite: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onNoShow: () => void;
}) {
  const status = STATUS_BADGE[b.status];
  const deposit = DEPOSIT_BADGE[b.deposit_status];
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-black/3">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="w-16 shrink-0">
          <div className="tnum text-sm font-semibold">{fmtTime(b.starts_at)}</div>
          {b.ends_at && <div className="text-[11px] text-black/35">to {fmtTime(b.ends_at)}</div>}
        </div>
        <Dot color={artistColor} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{clientName}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            {deposit && <Badge tone={deposit.tone}>{deposit.label}</Badge>}
          </div>
          <div className="mt-0.5 truncate text-xs text-black/45">
            {[artistName, b.service_desc, b.est_price_cents ? money(b.est_price_cents) : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </button>
      {canWrite && b.status === "scheduled" && (
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <button
            onClick={onComplete}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Complete
          </button>
          <button
            onClick={onNoShow}
            className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            No-show
          </button>
        </div>
      )}
    </div>
  );
}

function AddForm({
  clients,
  artists,
  onAdd,
  onCancel,
}: {
  clients: { id: string; name: string }[];
  artists: { id: string; name: string }[];
  onAdd: (input: {
    startsAt: string;
    endsAt?: string;
    clientId?: string | null;
    artistId?: string | null;
    serviceDesc?: string;
    estPriceCents?: number;
    depositCents?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    date: "",
    time: "",
    endTime: "",
    clientId: "",
    artistId: "",
    serviceDesc: "",
    estPrice: "",
    deposit: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.date || !f.time) {
      setErr("Pick a date and start time.");
      return;
    }
    setBusy(true);
    setErr(null);
    const startsAt = new Date(`${f.date}T${f.time}`).toISOString();
    const endsAt = f.endTime ? new Date(`${f.date}T${f.endTime}`).toISOString() : undefined;
    const res = await onAdd({
      startsAt,
      endsAt,
      clientId: f.clientId || null,
      artistId: f.artistId || null,
      serviceDesc: f.serviceDesc,
      estPriceCents: f.estPrice ? Math.round(parseFloat(f.estPrice) * 100) : 0,
      depositCents: f.deposit ? Math.round(parseFloat(f.deposit) * 100) : 0,
    });
    setBusy(false);
    if (!res.ok) setErr(res.error || "Could not create that booking.");
  };

  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [key]: e.target.value }));
  const input = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";

  return (
    <Card className="mb-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Labeled label="Date"><input className={input} type="date" value={f.date} onChange={set("date")} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Start"><input className={input} type="time" value={f.time} onChange={set("time")} /></Labeled>
          <Labeled label="End"><input className={input} type="time" value={f.endTime} onChange={set("endTime")} /></Labeled>
        </div>
        <Labeled label="Client">
          <select className={input} value={f.clientId} onChange={set("clientId")}>
            <option value="">Walk-in / unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Artist">
          <select className={input} value={f.artistId} onChange={set("artistId")}>
            <option value="">Any artist</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Service"><input className={input} value={f.serviceDesc} onChange={set("serviceDesc")} placeholder="Half-sleeve session, consult…" /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Est. price"><input className={input} value={f.estPrice} onChange={set("estPrice")} inputMode="decimal" placeholder="$" /></Labeled>
          <Labeled label="Deposit"><input className={input} value={f.deposit} onChange={set("deposit")} inputMode="decimal" placeholder="$" /></Labeled>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : "Create booking"}
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-black/10 px-4 py-2 text-sm text-black/55">
            Cancel
          </button>
          {err && <span className="text-xs text-rose-600">{err}</span>}
        </div>
      </form>
    </Card>
  );
}

function BookingDrawer({
  booking,
  clientName,
  artists,
  clients,
  canWrite,
  onClose,
  onSave,
}: {
  booking: Booking;
  clientName: string;
  artists: { id: string; name: string; color: string }[];
  clients: { id: string; name: string }[];
  canWrite: boolean;
  onClose: () => void;
  onSave: (patch: BookingPatch) => Promise<{ ok: boolean; error?: string }>;
}) {
  const start = new Date(booking.starts_at);
  const toDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const toTime = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");

  const [f, setF] = useState({
    date: toDate(start),
    time: toTime(booking.starts_at),
    endTime: toTime(booking.ends_at),
    clientId: booking.client_id ?? "",
    artistId: booking.artist_id ?? "",
    serviceDesc: booking.service_desc,
    estPrice: booking.est_price_cents ? String(booking.est_price_cents / 100) : "",
    deposit: booking.deposit_cents ? String(booking.deposit_cents / 100) : "",
    saleId: booking.sale_id ?? "",
    notes: booking.notes,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = STATUS_BADGE[booking.status];
  const deposit = DEPOSIT_BADGE[booking.deposit_status];

  const buildPatch = (): BookingPatch => ({
    startsAt: new Date(`${f.date}T${f.time}`).toISOString(),
    endsAt: f.endTime ? new Date(`${f.date}T${f.endTime}`).toISOString() : null,
    clientId: f.clientId || null,
    artistId: f.artistId || null,
    serviceDesc: f.serviceDesc,
    estPriceCents: f.estPrice ? Math.round(parseFloat(f.estPrice) * 100) : 0,
    depositCents: f.deposit ? Math.round(parseFloat(f.deposit) * 100) : 0,
    saleId: f.saleId || null,
    notes: f.notes,
  });

  const run = async (patch: BookingPatch) => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const res = await onSave(patch);
    setBusy(false);
    if (res.ok) setSaved(true);
    else setErr(res.error || "Could not save.");
  };

  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setF((s) => ({ ...s, [key]: e.target.value }));
    setSaved(false);
  };
  const input = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{clientName}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
            {booking.source === "square" && <Badge tone="brand">Square</Badge>}
            {booking.source === "web_request" && <Badge>Web request</Badge>}
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-black/45 hover:bg-black/5">Close</button>
        </div>

        <div className="space-y-4 p-5">
          {/* Deposit summary + lifecycle */}
          <div className="rounded-lg border border-black/8 bg-black/2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-black/40">Deposit</div>
                <div className="tnum mt-0.5 text-sm font-semibold">
                  {booking.deposit_cents ? money(booking.deposit_cents) : "None taken"}
                </div>
              </div>
              {deposit && <Badge tone={deposit.tone}>{deposit.label}</Badge>}
            </div>
            {canWrite && booking.deposit_status === "held" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button onClick={() => run({ depositStatus: "applied" })} disabled={busy} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:opacity-40">Apply to ticket</button>
                <button onClick={() => run({ depositStatus: "forfeited" })} disabled={busy} className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 disabled:opacity-40">Forfeit</button>
                <button onClick={() => run({ depositStatus: "refunded" })} disabled={busy} className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-black/55 disabled:opacity-40">Refund</button>
              </div>
            )}
          </div>

          {/* Status transitions */}
          {canWrite && (
            <div className="flex flex-wrap gap-1.5">
              {(["scheduled", "completed", "no_show", "cancelled"] as BookingStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => run({ status: s })}
                  disabled={busy || booking.status === s}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    booking.status === s ? "bg-brand text-white" : "border border-black/10 text-black/55 hover:bg-black/4"
                  } disabled:opacity-50`}
                >
                  {STATUS_BADGE[s].label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Date"><input className={input} type="date" value={f.date} onChange={set("date")} disabled={!canWrite} /></Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Start"><input className={input} type="time" value={f.time} onChange={set("time")} disabled={!canWrite} /></Labeled>
              <Labeled label="End"><input className={input} type="time" value={f.endTime} onChange={set("endTime")} disabled={!canWrite} /></Labeled>
            </div>
            <Labeled label="Client">
              <select className={input} value={f.clientId} onChange={set("clientId")} disabled={!canWrite}>
                <option value="">Walk-in / unassigned</option>
                {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </Labeled>
            <Labeled label="Artist">
              <select className={input} value={f.artistId} onChange={set("artistId")} disabled={!canWrite}>
                <option value="">Any artist</option>
                {artists.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </select>
            </Labeled>
            <Labeled label="Est. price"><input className={input} value={f.estPrice} onChange={set("estPrice")} inputMode="decimal" disabled={!canWrite} /></Labeled>
            <Labeled label="Deposit"><input className={input} value={f.deposit} onChange={set("deposit")} inputMode="decimal" disabled={!canWrite} /></Labeled>
          </div>

          <Labeled label="Service"><input className={input} value={f.serviceDesc} onChange={set("serviceDesc")} disabled={!canWrite} /></Labeled>

          <Labeled label="Final ticket (Square sale id)">
            <input className={input} value={f.saleId} onChange={set("saleId")} placeholder="Linked when the session is rung up" disabled={!canWrite} />
          </Labeled>

          <Labeled label="Notes">
            <textarea className={`${input} min-h-24 resize-y`} value={f.notes} onChange={set("notes")} placeholder="Reference, placement, healing notes…" disabled={!canWrite} />
          </Labeled>

          {canWrite && (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => run(buildPatch())} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {busy ? "Saving…" : "Save changes"}
              </button>
              {saved && <span className="text-xs text-emerald-600">Saved</span>}
              {err && <span className="text-xs text-rose-600">{err}</span>}
            </div>
          )}
        </div>
      </div>
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
