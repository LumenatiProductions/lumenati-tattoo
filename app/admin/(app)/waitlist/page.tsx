"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { useArtists } from "@/lib/admin/artists-context";
import { createClient } from "@/lib/supabase/browser";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { PageHead, Empty } from "@/components/admin/home/shared";
import type { Artist } from "@/lib/admin/types";

// The waitlist, on desktop. People who want in sooner, scoped to the signed-in
// artist's chair plus the shop's "open to anyone" pool. Its whole reason to
// exist is the cancel moment: when a booking dies, "Book them" drops a waiting
// name straight into a real slot. Reads the waitlist table, writes bookings and
// clients directly (same rows the phone app touches). "Text the waitlist" hands
// the freed slot to /api/waitlist/offer, which texts everyone reachable so the
// first tap wins.

type Entry = {
  id: string;
  artist_id: string | null;
  client_id: string | null;
  name: string;
  phone: string | null;
  want: string;
  active: boolean;
  booked_id: string | null;
  created_at: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const HOUR_MS = 3_600_000;

// Same double-booking guard the app runs client side. Returns the clashing
// start time, or null. (Ported from app-native/lib/clash.ts.)
async function findClash(artistId: string, startsAt: string): Promise<string | null> {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = start + HOUR_MS;
  const windowMs = 12 * HOUR_MS;
  const { data } = await createClient()
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("artist_id", artistId)
    .eq("status", "scheduled")
    .gte("starts_at", new Date(start - windowMs).toISOString())
    .lte("starts_at", new Date(end + windowMs).toISOString());
  for (const r of (data ?? []) as { id: string; starts_at: string; ends_at: string | null }[]) {
    const s2 = new Date(r.starts_at).getTime();
    const e2 = r.ends_at ? new Date(r.ends_at).getTime() : s2 + HOUR_MS;
    if (start < e2 && s2 < end) return r.starts_at;
  }
  return null;
}

export default function WaitlistPage() {
  const { asArtistId, shopId } = useRole();
  const { artists, loading } = useArtists();
  // Resolve to a real roster member: the previewed chair, else the first
  // artist. asArtistId defaults to a shared "jd" for owners, which isn't on
  // this shop's roster and unmounted the page to a blank pane.
  const artist = artists.find((a) => a.id === asArtistId) ?? artists[0];
  const artistId = artist?.id ?? asArtistId;

  const [rows, setRows] = useState<Entry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [want, setWant] = useState("");
  const [openToAny, setOpenToAny] = useState(false); // false = my chair, true = anyone
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null); // entry being booked
  const [note, setNote] = useState<string | null>(null);

  // My chair plus the shop's "open to anyone" leads. Anyone entries are the
  // ones an artist can pick up when they have a freed slot.
  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("waitlist")
      .select("id, artist_id, client_id, name, phone, want, active, booked_id, created_at")
      .eq("active", true)
      .or(`artist_id.eq.${artistId},artist_id.is.null`)
      .order("created_at", { ascending: true })
      .limit(100);
    setRows((data ?? []) as Entry[]);
  }, [artistId]);

  useEffect(() => {
    setRows(null);
    setBookingId(null);
    load();
  }, [load]);

  const openCount = useMemo(() => (rows ?? []).filter((r) => !r.artist_id).length, [rows]);

  const laneLabel = (id: string | null) =>
    id === null ? "anyone" : id === artistId ? "you" : artists.find((a) => a.id === id)?.name ?? "an artist";

  const add = async () => {
    if (!name.trim()) {
      setErr("A name is the whole point.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await createClient()
      .from("waitlist")
      .insert({
        id: `wl-${crypto.randomUUID()}`,
        artist_id: openToAny ? null : artistId,
        shop_id: shopId,
        name: name.trim(),
        phone: phone.trim() || null,
        want: want.trim(),
        active: true,
      });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setAdding(false);
    setName("");
    setPhone("");
    setWant("");
    setOpenToAny(false);
    load();
  };

  const remove = async (e: Entry) => {
    setRows((p) => (p ?? []).filter((r) => r.id !== e.id));
    const { error } = await createClient().from("waitlist").update({ active: false }).eq("id", e.id);
    if (error) load();
  };

  if (loading || !artist) {
    return (
      <div>
        <PageHead title="Waitlist" sub="People waiting to get in, and the freed slots you can hand them" />
        <Card>
          <Empty>
            {loading ? "Loading..." : "Add an artist to the shop to start a waitlist."}
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead title="Waitlist" sub="People waiting to get in, and the freed slots you can hand them" />

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => {
            setAdding((v) => !v);
            setErr(null);
          }}
          className={
            adding
              ? "rounded-lg border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
              : "rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          }
        >
          {adding ? "Cancel" : "Add to waitlist"}
        </button>
        {rows && rows.length > 0 && (
          <span className="text-sm text-white/60">
            {rows.length} waiting
            {openCount > 0 ? `, ${openCount} open to any artist` : ""}
          </span>
        )}
      </div>

      {adding && (
        <Card className="mb-5">
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-white/65">Name</span>
              <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-white/65">Phone</span>
              <input
                className="inp"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="So you can text them the slot"
                inputMode="tel"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-white/65">What they want</span>
              <input
                className="inp"
                value={want}
                onChange={(e) => setWant(e.target.value)}
                placeholder="flash piece, sleeve start..."
              />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={openToAny}
                onChange={(e) => setOpenToAny(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm text-white/75">
                Open to any artist (a lead the whole shop can pick up)
              </span>
            </label>
            {err && <p className="text-sm text-rose-400 sm:col-span-2">{err}</p>}
            <div className="sm:col-span-2">
              <button
                onClick={add}
                disabled={busy}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Adding..." : "Add them"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {note && (
        <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
          {note}
        </div>
      )}

      <SectionTitle>Waiting</SectionTitle>
      <Card>
        {rows === null ? (
          <div className="px-4 py-8 text-center text-sm text-white/45">Loading...</div>
        ) : rows.length === 0 ? (
          <Empty>
            Nobody waiting. Add walk-ins you had to turn away, they are tomorrow&apos;s filled slots.
          </Empty>
        ) : (
          <div className="divide-y divide-white/8">
            {rows.map((e) => (
              <div key={e.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{e.name}</div>
                    <div className="mt-0.5 text-xs text-white/60">
                      {e.want || "Anything"} · waiting for {laneLabel(e.artist_id)}
                      {e.phone ? ` · ${e.phone}` : ""}
                    </div>
                  </div>
                  <Badge tone={e.artist_id ? "neutral" : "brand"}>{dayLabel(e.created_at)}</Badge>
                </div>

                {bookingId === e.id ? (
                  <FillSlot
                    entry={e}
                    artistId={artistId}
                    shopId={shopId}
                    onDone={(when) => {
                      setBookingId(null);
                      setNote(`${e.name} booked, ${dayLabel(when)} at ${clock(when)}.`);
                      load();
                    }}
                    onCancel={() => setBookingId(null)}
                  />
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setBookingId(e.id);
                        setNote(null);
                      }}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      Book them
                    </button>
                    <button
                      onClick={() => remove(e)}
                      className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-400/10"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// The payoff: a waiting name into a real slot. Creates the client on the fly
// when the entry isn't linked to one, guards the double-book, retires the row.
// The artist always books their own chair (desktop is scoped to one artist).
function FillSlot({
  entry,
  artistId,
  shopId,
  onDone,
  onCancel,
}: {
  entry: Entry;
  artistId: string;
  shopId: string | null;
  onDone: (whenISO: string) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(localDate(new Date()));
  const [time, setTime] = useState("12:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [texting, setTexting] = useState(false);

  const book = async () => {
    setBusy(true);
    setErr(null);
    const sb = createClient();
    const startsAt = new Date(`${date}T${time}:00`).toISOString();

    const clash = await findClash(artistId, startsAt);
    if (clash) {
      setBusy(false);
      setErr(`You already have a booking at ${clock(clash)}. Pick another time.`);
      return;
    }

    let cid = entry.client_id;
    if (!cid) {
      cid = `walkin-${crypto.randomUUID()}`;
      const [first, ...rest] = entry.name.split(/\s+/);
      const { error } = await sb.from("clients").insert({
        id: cid,
        shop_id: shopId,
        first_name: first,
        last_name: rest.join(" "),
        phone: entry.phone,
        preferred_artist_id: artistId,
        source: "manual",
        first_seen: localDate(new Date()),
      });
      if (error) {
        setBusy(false);
        setErr(error.message);
        return;
      }
    }

    const bkId = `bk-${crypto.randomUUID()}`;
    const { error } = await sb.from("bookings").insert({
      id: bkId,
      shop_id: shopId,
      artist_id: artistId,
      client_id: cid,
      starts_at: startsAt,
      status: "scheduled",
      service_desc: entry.want,
      deposit_cents: 0,
      deposit_status: "none",
      source: "manual",
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    await sb.from("waitlist").update({ active: false, booked_id: bkId }).eq("id", entry.id);
    setBusy(false);
    onDone(startsAt);
  };

  // Hand the freed slot to the whole waitlist, first tap wins. The offer API
  // texts everyone reachable in this artist's lane plus the anyone pool.
  const textWaitlist = async () => {
    setTexting(true);
    setErr(null);
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const r = await fetch("/api/waitlist/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistId, startsAt, serviceHint: entry.want }),
    });
    const d = (await r.json().catch(() => ({}))) as {
      texted?: number;
      waiting?: number;
      smsReady?: boolean;
      error?: string;
      note?: string;
    };
    setTexting(false);
    if (!r.ok) {
      setErr(d.error || "Could not text the waitlist.");
      return;
    }
    if (!d.smsReady) {
      setErr("Texting is not connected yet, so nobody was messaged.");
      return;
    }
    setErr(null);
    onCancel();
    alert(
      d.texted
        ? `Texted ${d.texted} on the waitlist, first tap wins.${d.note ? ` (${d.note})` : ""}`
        : "Nobody on the waitlist had a reachable number.",
    );
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/4 p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/65">Date</span>
          <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/65">Time</span>
          <input type="time" className="inp" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {err && <p className="mt-2 text-sm text-rose-400">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={book}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Booking..." : "Book the slot"}
        </button>
        {entry.phone && (
          <button
            onClick={textWaitlist}
            disabled={texting}
            className="rounded-lg border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
          >
            {texting ? "Texting..." : "Text the waitlist this slot"}
          </button>
        )}
        <button
          onClick={onCancel}
          className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/6"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
