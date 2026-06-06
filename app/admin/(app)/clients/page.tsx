"use client";

import { useMemo, useState } from "react";
import { useClients, type Client, type ClientPatch } from "@/lib/admin/clients-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle, StatCard, Badge, Dot } from "@/components/admin/ui";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fullName = (c: Client) => `${c.first_name} ${c.last_name}`.trim() || "Unnamed client";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function ClientsPage() {
  const { clients, loading, error, total, newThisMonth, addClient, updateClient, syncFromSquare } =
    useClients();
  const { artists } = useArtists();
  const { realRole } = useRole();
  const canSync = realRole === "owner";

  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : null);
  }, [artists]);
  const artistColor = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.color] as const));
    return (id: string | null) => (id ? m.get(id) ?? "#999" : "#111");
  }, [artists]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) =>
      [c.first_name, c.last_name, c.email, c.phone, c.instagram]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle)),
    );
  }, [clients, q]);

  // "Returning" = seen on more than one day (came back after the first visit).
  const returning = clients.filter((c) => c.first_seen && c.last_seen && c.last_seen > c.first_seen).length;
  const returningRate = total ? Math.round((returning / total) * 100) : 0;
  const fromSquare = clients.some((c) => c.source === "square");

  const selected = clients.find((c) => c.id === selectedId) ?? null;

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const res = await syncFromSquare();
    setSyncing(false);
    setSyncMsg(
      res.ok
        ? `Synced ${res.updated ?? 0} customer${res.updated === 1 ? "" : "s"} from Square.`
        : res.error || "Sync failed.",
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-black/50">
            One record per person who comes in — contact, history, and who they sit with.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            {adding ? "Close" : "Add walk-in"}
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
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clients" value={String(total)} accent />
        <StatCard label="New this month" value={String(newThisMonth)} tone={newThisMonth ? "good" : "neutral"} />
        <StatCard label="Returning" value={`${returningRate}%`} sub={`${returning} came back`} />
        <StatCard label="Source" value={fromSquare ? "Square + manual" : "Manual"} sub={fromSquare ? "synced nightly" : "auto-pull not run yet"} />
      </div>

      {syncMsg && (
        <div className="mb-4 rounded-lg border border-black/10 bg-black/3 px-3 py-2 text-xs text-black/60">
          {syncMsg}
        </div>
      )}

      {adding && (
        <AddForm
          artists={artists.map((a) => ({ id: a.id, name: a.name }))}
          onCancel={() => setAdding(false)}
          onAdd={async (input) => {
            const res = await addClient(input);
            if (res.ok) {
              setAdding(false);
              if (res.client) setSelectedId(res.client.id);
            }
            return res;
          }}
        />
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, email, or @handle…"
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm sm:max-w-md"
        />
      </div>

      <SectionTitle action={<span className="text-xs text-black/40">{filtered.length} shown</span>}>
        Roster
      </SectionTitle>

      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">Loading clients…</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-amber-600">{error}</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-black/40">
            {clients.length === 0
              ? "No clients yet. Add a walk-in above, or sync from Square."
              : "No clients match that search."}
          </div>
        </Card>
      ) : (
        <Card className="divide-y divide-black/6 overflow-hidden">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{fullName(c)}</span>
                  {c.source === "square" ? (
                    <Badge tone="brand">Square</Badge>
                  ) : (
                    <Badge>Walk-in</Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-black/45">
                  {[c.phone, c.email, c.instagram ? `@${c.instagram}` : null].filter(Boolean).join(" · ") || "No contact on file"}
                </div>
              </div>
              {c.preferred_artist_id && (
                <div className="hidden items-center gap-1.5 sm:flex">
                  <Dot color={artistColor(c.preferred_artist_id)} />
                  <span className="text-xs text-black/55">{artistName(c.preferred_artist_id)}</span>
                </div>
              )}
              <div className="w-20 text-right">
                <div className="tnum text-sm font-semibold">{money(c.total_spent_cents)}</div>
                <div className="text-[11px] text-black/40">{fmtDate(c.last_seen)}</div>
              </div>
            </button>
          ))}
        </Card>
      )}

      {selected && (
        <ClientDrawer
          client={selected}
          artists={artists.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => updateClient(selected.id, patch)}
        />
      )}
    </div>
  );
}

function AddForm({
  artists,
  onAdd,
  onCancel,
}: {
  artists: { id: string; name: string }[];
  onAdd: (input: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    instagram?: string;
    birthdate?: string;
    preferredArtistId?: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    instagram: "",
    birthdate: "",
    preferredArtistId: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.firstName.trim() && !f.lastName.trim()) {
      setErr("A first or last name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await onAdd({
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email,
      phone: f.phone,
      instagram: f.instagram,
      birthdate: f.birthdate || undefined,
      preferredArtistId: f.preferredArtistId || null,
    });
    setBusy(false);
    if (!res.ok) setErr(res.error || "Could not add that client.");
  };

  const field = (key: keyof typeof f) => ({
    value: f[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((s) => ({ ...s, [key]: e.target.value })),
    className: "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm",
  });

  return (
    <Card className="mb-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Labeled label="First name"><input {...field("firstName")} /></Labeled>
        <Labeled label="Last name"><input {...field("lastName")} /></Labeled>
        <Labeled label="Phone"><input {...field("phone")} inputMode="tel" /></Labeled>
        <Labeled label="Email"><input {...field("email")} inputMode="email" /></Labeled>
        <Labeled label="Instagram"><input {...field("instagram")} placeholder="handle" /></Labeled>
        <Labeled label="Birthdate"><input {...field("birthdate")} type="date" /></Labeled>
        <Labeled label="Preferred artist">
          <select {...field("preferredArtistId")}>
            <option value="">No preference</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Labeled>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Add client"}
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

function ClientDrawer({
  client,
  artists,
  onClose,
  onSave,
}: {
  client: Client;
  artists: { id: string; name: string; color: string }[];
  onClose: () => void;
  onSave: (patch: ClientPatch) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [f, setF] = useState({
    firstName: client.first_name,
    lastName: client.last_name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    instagram: client.instagram ?? "",
    birthdate: client.birthdate ?? "",
    notes: client.notes ?? "",
    preferredArtistId: client.preferred_artist_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const res = await onSave({
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email,
      phone: f.phone,
      instagram: f.instagram,
      birthdate: f.birthdate || null,
      notes: f.notes,
      preferredArtistId: f.preferredArtistId || null,
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
    } else {
      setErr(res.error || "Could not save.");
    }
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
            <h2 className="text-lg font-semibold">{fullName(client)}</h2>
            {client.source === "square" ? <Badge tone="brand">Square</Badge> : <Badge>Walk-in</Badge>}
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-black/45 hover:bg-black/5">Close</button>
        </div>

        <div className="space-y-4 p-5">
          {/* Spend + visit history */}
          <div className="grid grid-cols-3 gap-3">
            <Mini label="Lifetime" value={money(client.total_spent_cents)} />
            <Mini label="First seen" value={fmtDate(client.first_seen)} />
            <Mini label="Last seen" value={fmtDate(client.last_seen)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="First name"><input className={input} value={f.firstName} onChange={set("firstName")} /></Labeled>
            <Labeled label="Last name"><input className={input} value={f.lastName} onChange={set("lastName")} /></Labeled>
            <Labeled label="Phone"><input className={input} value={f.phone} onChange={set("phone")} inputMode="tel" /></Labeled>
            <Labeled label="Email"><input className={input} value={f.email} onChange={set("email")} inputMode="email" /></Labeled>
            <Labeled label="Instagram"><input className={input} value={f.instagram} onChange={set("instagram")} placeholder="handle" /></Labeled>
            <Labeled label="Birthdate"><input className={input} type="date" value={f.birthdate} onChange={set("birthdate")} /></Labeled>
          </div>

          <Labeled label="Preferred artist">
            <select className={input} value={f.preferredArtistId} onChange={set("preferredArtistId")}>
              <option value="">No preference</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Notes">
            <textarea
              className={`${input} min-h-24 resize-y`}
              value={f.notes}
              onChange={set("notes")}
              placeholder="Allergies, healing notes, what they're working on…"
            />
          </Labeled>

          {/* Pieces come from bookings/sales once those features link to a client. */}
          <div className="rounded-lg border border-dashed border-black/12 px-3 py-3 text-xs text-black/40">
            Past pieces and appointments will show here once Bookings is linked to clients.
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="text-xs text-emerald-600">Saved</span>}
            {err && <span className="text-xs text-rose-600">{err}</span>}
          </div>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/3 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-black/40">{label}</div>
      <div className="tnum mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
