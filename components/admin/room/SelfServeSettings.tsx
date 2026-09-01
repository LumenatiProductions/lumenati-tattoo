"use client";

import { useEffect, useState } from "react";
import { DAY_KEYS, type DayKey, type Hours } from "@/lib/bookings/slots";

// "Clients can book open times" — the artist's self-serve setup, on My Page
// right under the books switch. Weekly hours on the shop clock, how long a
// session runs, the deposit that locks a time. Saves through
// /api/artist/booking-settings (artist: own chair; admin: any chair).

const DAY_LABEL: Record<DayKey, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const SESSIONS = [60, 90, 120, 180, 240, 360];

type State = {
  selfServe: boolean;
  hours: Hours;
  sessionMinutes: number;
  depositCents: number;
};

export default function SelfServeSettings({ artistId }: { artistId: string }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [deposit, setDeposit] = useState("");

  useEffect(() => {
    let alive = true;
    setS(null);
    fetch(`/api/artist/booking-settings?artist=${encodeURIComponent(artistId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d.ok) return;
        setS({ selfServe: d.selfServe, hours: d.hours, sessionMinutes: d.sessionMinutes, depositCents: d.depositCents });
        setDeposit(d.depositCents ? String(d.depositCents / 100) : "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [artistId]);

  const save = async (patch: Partial<State>) => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/artist/booking-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId, ...patch }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || "Could not save.");
        return;
      }
      setS({ selfServe: d.selfServe, hours: d.hours, sessionMinutes: d.sessionMinutes, depositCents: d.depositCents });
      setMsg("Saved.");
      setTimeout(() => setMsg(null), 1500);
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <div className="p-4 text-sm text-white/55">Loading…</div>;

  const hasHours = DAY_KEYS.some((k) => (s.hours[k] ?? []).length > 0);
  const setDay = (k: DayKey, on: boolean) => {
    const next: Hours = { ...s.hours, [k]: on ? [["11:00", "19:00"]] : [] };
    save({ hours: next });
  };
  const setWindow = (k: DayKey, which: 0 | 1, value: string) => {
    const cur = (s.hours[k] ?? [["11:00", "19:00"]])[0] ?? ["11:00", "19:00"];
    const win: [string, string] = which === 0 ? [value, cur[1]] : [cur[0], value];
    const next: Hours = { ...s.hours, [k]: [win] };
    setS({ ...s, hours: next });
  };
  const commitWindow = () => save({ hours: s.hours });

  const inp = "rounded-md border border-white/12 bg-white/6 px-2 py-1 text-sm text-white";

  return (
    <div className="divide-y divide-white/8">
      <div className="flex items-center justify-between p-4">
        <div>
          <div className="text-sm font-semibold">Clients can book open times</div>
          <div className="text-xs text-white/55">
            {s.selfServe
              ? hasHours
                ? "Your page shows your open times. A client picks one, pays the deposit, and it lands on your book."
                : "Set your hours below and your page starts showing open times."
              : "Off: clients send a request and you book it by hand."}
          </div>
        </div>
        <button
          onClick={() => save({ selfServe: !s.selfServe })}
          disabled={busy}
          aria-pressed={s.selfServe}
          className={`relative h-6 w-11 rounded-full transition-colors ${s.selfServe ? "bg-brand" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${s.selfServe ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <div className="p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/55">Hours</div>
        <div className="space-y-1.5">
          {DAY_KEYS.map((k) => {
            const on = (s.hours[k] ?? []).length > 0;
            const win = s.hours[k]?.[0] ?? ["11:00", "19:00"];
            return (
              <div key={k} className="flex items-center gap-3 text-sm">
                <label className="flex w-20 items-center gap-2">
                  <input type="checkbox" checked={on} onChange={(e) => setDay(k, e.target.checked)} className="accent-brand" />
                  <span className={on ? "text-white" : "text-white/45"}>{DAY_LABEL[k]}</span>
                </label>
                {on ? (
                  <>
                    <input type="time" className={inp} value={win[0]} onChange={(e) => setWindow(k, 0, e.target.value)} onBlur={commitWindow} />
                    <span className="text-white/45">to</span>
                    <input type="time" className={inp} value={win[1]} onChange={(e) => setWindow(k, 1, e.target.value)} onBlur={commitWindow} />
                  </>
                ) : (
                  <span className="text-xs text-white/40">off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/55">Session length</span>
          <select className={`${inp} w-full`} value={s.sessionMinutes} onChange={(e) => save({ sessionMinutes: Number(e.target.value) })}>
            {SESSIONS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? "" : "s"}`}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-white/45">Open times are offered one session apart.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/55">Deposit to book</span>
          <div className="flex items-center gap-2">
            <span className="text-white/55">$</span>
            <input
              className={`${inp} w-28`}
              inputMode="decimal"
              placeholder="0"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              onBlur={() => {
                const cents = Math.round((Number(deposit) || 0) * 100);
                if (cents !== s.depositCents) save({ depositCents: cents });
              }}
            />
          </div>
          <span className="mt-1 block text-xs text-white/45">$0 books without a deposit. Paid deposits hold the time; no-shows forfeit it.</span>
        </label>
      </div>
      {msg && <div className="px-4 pb-3 text-xs text-white/65">{msg}</div>}
    </div>
  );
}
