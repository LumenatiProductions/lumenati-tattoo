"use client";

import { useCallback, useEffect, useState } from "react";
import { useBookings } from "@/lib/admin/bookings-context";
import { useArtists } from "@/lib/admin/artists-context";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";

// Website booking requests, worked from the top of the Bookings page. Accept
// picks a date/time (+ optional deposit) and converts the request into a real
// booking (source = web_request); decline just stamps it. Hidden entirely until
// the booking_requests schema is applied AND something is pending.

type BookingRequest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  artist_id: string | null;
  idea: string;
  placement: string;
  size: string;
  availability: string;
  reference_urls?: string[] | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

const ago = (iso: string) => {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default function RequestsInbox() {
  const { refresh: refreshBookings } = useBookings();
  const { artists } = useArtists();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bookings/request");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setRequests((d.requests || []).filter((x: BookingRequest) => x.status === "pending"));
    } catch {
      /* quiet — the inbox just stays empty */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, body: Record<string, unknown>) => {
    setMsg(null);
    const r = await fetch("/api/bookings/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(d.error || "Could not update that request.");
      return false;
    }
    // Tell the desk what happened with the deposit link.
    if (body.action === "accept" && d.depositLink) {
      setMsg(
        d.depositLink.sent
          ? `Booked — deposit link ${d.depositLink.via === "sms" ? "texted" : "emailed"} to the client.`
          : `Booked — deposit link couldn't be sent (${(d.depositLink.reason || "unknown").toLowerCase()}). Copy it: ${d.depositLink.url}`,
      );
    }
    setOpenId(null);
    await Promise.all([load(), body.action === "accept" ? refreshBookings() : Promise.resolve()]);
    return true;
  };

  // Keep rendering while a notice is up — accepting the last request should
  // show "deposit link emailed", not vanish the whole section mid-sentence.
  if (requests.length === 0 && !msg) return null;

  return (
    <div className="mb-6">
      <SectionTitle>
        Requests <span className="font-normal text-black/35">· from the website</span>
      </SectionTitle>
      {msg && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
            /could not|couldn't/i.test(msg)
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {msg}
        </div>
      )}
      {requests.length === 0 ? null : (
      <Card className="divide-y divide-black/5">
        {requests.map((q) => {
          const artist = artists.find((a) => a.id === q.artist_id);
          return (
            <div key={q.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{q.name}</span>
                    <Badge tone="brand">{artist?.name ?? "Any artist"}</Badge>
                    <span className="text-[11px] text-black/35">{ago(q.created_at)}</span>
                  </div>
                  <div className="mt-1 text-sm text-black/70">{q.idea}</div>
                  <div className="mt-0.5 text-xs text-black/45">
                    {[q.placement && `Placement: ${q.placement}`, q.size && `Size: ${q.size}`, q.availability && `Avail: ${q.availability}`, q.email, q.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {Array.isArray(q.reference_urls) && q.reference_urls.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {q.reference_urls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" title="Open full size">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={u}
                            alt={`Reference ${i + 1} from ${q.name}`}
                            className="h-16 w-16 rounded-lg border border-black/10 object-cover hover:opacity-80"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setOpenId(openId === q.id ? null : q.id)}
                    className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                  >
                    {openId === q.id ? "Close" : "Book it"}
                  </button>
                  <button
                    onClick={() => window.confirm(`Decline ${q.name}'s request?`) && act(q.id, { action: "decline" })}
                    className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-black/55 hover:bg-black/4"
                  >
                    Decline
                  </button>
                </div>
              </div>
              {openId === q.id && <AcceptForm request={q} artists={artists} onAccept={(body) => act(q.id, { action: "accept", ...body })} />}
            </div>
          );
        })}
      </Card>
      )}
    </div>
  );
}

function AcceptForm({
  request,
  artists,
  onAccept,
}: {
  request: BookingRequest;
  artists: { id: string; name: string }[];
  onAccept: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("13:00");
  const [artistId, setArtistId] = useState(request.artist_id ?? "");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!date || !time) {
      setErr("Pick a date and start time.");
      return;
    }
    setErr(null);
    setBusy(true);
    const ok = await onAccept({
      startsAt: new Date(`${date}T${time}`).toISOString(),
      artistId: artistId || null,
      depositCents: deposit ? Math.round(parseFloat(deposit) * 100) : 0,
    });
    setBusy(false);
    if (!ok) setErr(null); // the inbox-level banner shows the API error
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-black/8 bg-black/2 p-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Date</span>
        <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Start</span>
        <input type="time" className="inp" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Artist</span>
        <select className="inp" value={artistId} onChange={(e) => setArtistId(e.target.value)}>
          <option value="">Unassigned</option>
          {artists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-black/45">Deposit ($)</span>
        <input className="inp w-24" inputMode="decimal" placeholder="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
      </label>
      <button
        onClick={submit}
        disabled={busy}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Booking…" : "Create booking"}
      </button>
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}
