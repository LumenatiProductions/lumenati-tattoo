"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { createClient } from "@/lib/supabase/browser";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { PageHead, Empty } from "@/components/admin/home/shared";

// The artist's own people, on desktop. The mobile My clients screen, ported:
// RLS scopes clients to you, this page does the remembering — how many sessions,
// what you did last, how long it's been — plus a private notebook per client
// (artist_client_notes) the desk's CRM notes never touch. The "been a while"
// rail up top is the money part: names quietly overdue for their next session,
// one click from a rebook. Reads clients / bookings / healed_photos /
// artist_client_notes, always filtered to the signed-in artist.

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  instagram: string | null;
};
type BookingRow = {
  client_id: string | null;
  starts_at: string;
  status: string;
  service_desc: string;
};
type Person = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  sessions: number;
  lastPast: string | null; // ISO of the most recent session already done
  lastService: string;
  nextUp: string | null; // ISO of an upcoming booking, if any
  healed: number;
};

const NUDGE_DAYS = 90;
const dayMs = 86_400_000;

const monthsSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * dayMs));
const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const prettyDateYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function MyClientsPage() {
  const { asArtistId } = useRole();

  const [people, setPeople] = useState<Person[] | null>(null);
  const [bookingsByClient, setBookingsByClient] = useState<Map<string, BookingRow[]>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async (aid: string) => {
    const sb = createClient();
    // Two artist-scoped reads first: every booking I have, my healed shots.
    // The clients themselves come from the client_ids those bookings touch
    // (the desk's clients table has no artist column — the booking IS the tie).
    const [{ data: bookings }, { data: healed }] = await Promise.all([
      sb
        .from("bookings")
        .select("client_id, starts_at, status, service_desc")
        .eq("artist_id", aid)
        .not("client_id", "is", null)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: false })
        .limit(1000),
      sb
        .from("healed_photos")
        .select("client_id")
        .eq("artist_id", aid)
        .neq("status", "dismissed")
        .limit(500),
    ]);

    const byClient = new Map<string, BookingRow[]>();
    for (const b of (bookings ?? []) as BookingRow[]) {
      if (!b.client_id) continue;
      const arr = byClient.get(b.client_id) ?? [];
      arr.push(b);
      byClient.set(b.client_id, arr);
    }
    const healedBy = new Map<string, number>();
    for (const h of (healed ?? []) as { client_id: string | null }[]) {
      if (h.client_id) healedBy.set(h.client_id, (healedBy.get(h.client_id) ?? 0) + 1);
    }

    // Now hydrate just the clients we actually share a booking with.
    const clientIds = [...byClient.keys()];
    const { data: clients } = clientIds.length
      ? await sb
          .from("clients")
          .select("id, first_name, last_name, phone, instagram")
          .in("id", clientIds)
          .limit(500)
      : { data: [] as ClientRow[] };

    const now = Date.now();
    const out: Person[] = [];
    for (const c of (clients ?? []) as ClientRow[]) {
      const bs = byClient.get(c.id) ?? [];
      if (bs.length === 0) continue; // no shared history — skip
      const past = bs.filter((b) => new Date(b.starts_at).getTime() <= now);
      const future = bs.filter(
        (b) => new Date(b.starts_at).getTime() > now && b.status === "scheduled",
      );
      const lastPast = past[0] ?? null;
      out.push({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim() || "Client",
        phone: c.phone,
        instagram: c.instagram,
        sessions: past.length,
        lastPast: lastPast?.starts_at ?? null,
        lastService: lastPast?.service_desc ?? "",
        nextUp: future.length ? future[future.length - 1].starts_at : null,
        healed: healedBy.get(c.id) ?? 0,
      });
    }
    out.sort((a, b) => (b.lastPast ?? "").localeCompare(a.lastPast ?? ""));
    setBookingsByClient(byClient);
    setPeople(out);
  }, []);

  useEffect(() => {
    setPeople(null);
    load(asArtistId);
  }, [asArtistId, load]);

  // Quietly overdue: no future booking, last session NUDGE_DAYS+ ago.
  const overdue = useMemo(
    () =>
      (people ?? [])
        .filter(
          (p) =>
            !p.nextUp && p.lastPast && Date.now() - new Date(p.lastPast).getTime() > NUDGE_DAYS * dayMs,
        )
        .sort((a, b) => (a.lastPast ?? "").localeCompare(b.lastPast ?? "")),
    [people],
  );

  const open = openId ? (people ?? []).find((p) => p.id === openId) ?? null : null;

  const shownPeople = !q.trim()
    ? people ?? []
    : (people ?? []).filter((p) => {
        const s = q.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(s) ||
          (p.phone ?? "").toLowerCase().includes(s) ||
          (p.instagram ?? "").toLowerCase().includes(s)
        );
      });

  return (
    <div>
      <PageHead title="My clients" sub="Your people, their history, and your private notes" />

      {people === null ? (
        <Card>
          <div className="px-4 py-6 text-center text-sm text-white/55">Loading your clients…</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {overdue.length > 0 && (
              <div className="mb-6">
                <SectionTitle>Been a while</SectionTitle>
                <Card>
                  <div className="divide-y divide-white/8">
                    {overdue.slice(0, 6).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setOpenId(p.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{p.name}</div>
                          <div className="truncate text-xs text-white/60">
                            {monthsSince(p.lastPast!)} months since{" "}
                            {p.lastService ? `the ${p.lastService}` : "their last session"}
                          </div>
                        </div>
                        <Badge tone="warn">Reach out</Badge>
                      </button>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            <SectionTitle>Your people ({people.length})</SectionTitle>
            {people.length > 5 && (
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, phone, or Instagram"
                className="inp mb-3"
              />
            )}
            <Card>
              {people.length === 0 ? (
                <Empty>Your clients show up here after your first booking with them.</Empty>
              ) : shownPeople.length === 0 ? (
                <Empty>No one matches &ldquo;{q.trim()}&rdquo;.</Empty>
              ) : (
                <div className="divide-y divide-white/8">
                  {shownPeople.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setOpenId(p.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 ${
                        openId === p.id ? "bg-white/5" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{p.name}</div>
                        <div className="truncate text-xs text-white/60">
                          {p.sessions} session{p.sessions === 1 ? "" : "s"}
                          {p.lastPast ? ` · last ${prettyDate(p.lastPast)}` : ""}
                          {p.healed ? ` · ${p.healed} healed shot${p.healed === 1 ? "" : "s"}` : ""}
                        </div>
                      </div>
                      {p.nextUp ? <Badge tone="good">Booked {prettyDate(p.nextUp)}</Badge> : null}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-1">
            {open ? (
              <ClientDetail
                key={open.id}
                person={open}
                artistId={asArtistId}
                history={(bookingsByClient.get(open.id) ?? []).filter(
                  (b) => new Date(b.starts_at).getTime() <= Date.now(),
                )}
                onRebooked={() => load(asArtistId)}
              />
            ) : (
              <Card>
                <div className="px-4 py-10 text-center text-sm text-white/50">
                  Pick a client to see their history and your notes.
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientDetail({
  person,
  artistId,
  history,
  onRebooked,
}: {
  person: Person;
  artistId: string;
  history: BookingRow[];
  onRebooked: () => void;
}) {
  const [note, setNote] = useState("");
  const [loadedNote, setLoadedNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    createClient()
      .from("artist_client_notes")
      .select("note")
      .eq("artist_id", artistId)
      .eq("client_id", person.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const n = (data?.note as string) ?? "";
        setNote(n);
        setLoadedNote(n);
      });
    return () => {
      alive = false;
    };
  }, [artistId, person.id]);

  const saveNote = async () => {
    setSaving(true);
    const { error } = await createClient().from("artist_client_notes").upsert({
      artist_id: artistId,
      client_id: person.id,
      note: note.trim(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (!error) {
      setLoadedNote(note.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  };

  const dirty = note.trim() !== loadedNote;

  return (
    <Card>
      <div className="p-4">
        <div className="text-lg font-bold">{person.name}</div>
        <div className="mt-0.5 text-xs text-white/60">
          {person.sessions} session{person.sessions === 1 ? "" : "s"} with you
          {person.phone ? ` · ${person.phone}` : ""}
          {person.instagram ? ` · @${person.instagram}` : ""}
        </div>

        <div className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">
          Your notes
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Placement, style, skin, what you talked about..."
          rows={4}
          className="inp resize-y"
        />
        {(dirty || saved) && (
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={saveNote}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saved ? "Saved" : saving ? "Saving…" : "Save note"}
            </button>
            {saved && <span className="text-sm font-medium text-emerald-400">Saved</span>}
          </div>
        )}

        <div className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">
          Work together
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-white/45">Nothing on the books yet.</div>
        ) : (
          <div className="space-y-1.5">
            {history.slice(0, 8).map((b, i) => (
              <div key={`${b.starts_at}-${i}`} className="flex items-center gap-3">
                <span className="tnum w-24 shrink-0 text-xs text-white/50">
                  {prettyDateYear(b.starts_at)}
                </span>
                <span className="truncate text-sm">{b.service_desc || "Session"}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 border-t border-white/8 pt-5">
          <RebookForm
            artistId={artistId}
            clientId={person.id}
            clientName={person.name}
            serviceHint={person.lastService}
            onRebooked={onRebooked}
          />
        </div>
      </div>
    </Card>
  );
}

// The point of remembering: get the next one on the books. Posts to the shared
// /api/bookings route (same clash guard and columns the admin book uses),
// pinned to this artist and client.
const fourWeeksOut = () => new Date(Date.now() + 28 * dayMs).toISOString().slice(0, 10);
const prettyDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function RebookForm({
  artistId,
  clientId,
  clientName,
  serviceHint,
  onRebooked,
}: {
  artistId: string;
  clientId: string;
  clientName: string;
  serviceHint: string;
  onRebooked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(fourWeeksOut());
  const [time, setTime] = useState("12:00");
  const [service, setService] = useState(serviceHint);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);

  const book = async () => {
    setErr(null);
    setBusy(true);
    // A real instant — a bare local string reads as UTC in Postgres and lands
    // hours off.
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt,
        artistId,
        clientId,
        serviceDesc: service.trim(),
        source: "manual",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || "Could not book. Pick another time.");
      return;
    }
    setBooked(`${clientName} on the books — ${prettyDay(date)} at ${time}.`);
    onRebooked();
  };

  if (booked) {
    return <div className="text-sm font-semibold text-emerald-400">{booked}</div>;
  }

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          Book their next session
        </button>
        <p className="mt-2 text-center text-xs text-white/50">
          On the books beats in your head — take ten seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Their next session</div>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-white/60">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="inp" />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs text-white/60">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="inp" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-white/60">Session</span>
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="e.g. half-sleeve, next pass"
          className="inp"
        />
      </label>
      {err && <div className="text-sm text-rose-400">{err}</div>}
      <button
        onClick={book}
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Booking…" : `Book ${prettyDay(date)}`}
      </button>
    </div>
  );
}
