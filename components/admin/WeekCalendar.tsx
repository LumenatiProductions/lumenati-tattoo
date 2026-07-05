"use client";

import { useMemo, useState } from "react";
import type { Booking } from "@/lib/admin/bookings-context";

// Week grid for Bookings — the desk view. Day columns, hour lines, blocks
// positioned by start time and colored per artist; click opens the same
// drawer as the list. Pure client math over the bookings already in context,
// no extra fetches.

const DAY_START = 8; // 8am
const DAY_END = 22; // 10pm
const HOUR_PX = 44;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Monday of the week containing `d`.
function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = (out.getDay() + 6) % 7; // Mon=0
  out.setDate(out.getDate() - dow);
  return out;
}

export default function WeekCalendar({
  bookings,
  artists,
  onOpen,
}: {
  bookings: Booking[];
  artists: { id: string; name: string; color: string }[];
  onOpen: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const days = useMemo(() => {
    const start = mondayOf(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const d of days) m.set(dayKey(d), []);
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const k = dayKey(new Date(b.starts_at));
      m.get(k)?.push(b);
    }
    return m;
  }, [bookings, days]);

  // Ids of scheduled bookings that overlap another scheduled booking for the
  // SAME artist — flagged with a red ring so a double-book is obvious at a glance.
  const conflictIds = useMemo(() => {
    const HOUR_MS = 3_600_000;
    const span = (b: Booking) => {
      const s = new Date(b.starts_at).getTime();
      return [s, b.ends_at ? new Date(b.ends_at).getTime() : s + HOUR_MS] as const;
    };
    const out = new Set<string>();
    const sched = bookings.filter((b) => b.status === "scheduled" && b.artist_id);
    for (let i = 0; i < sched.length; i++) {
      for (let j = i + 1; j < sched.length; j++) {
        if (sched[i].artist_id !== sched[j].artist_id) continue;
        const [s1, e1] = span(sched[i]);
        const [s2, e2] = span(sched[j]);
        if (s1 < e2 && s2 < e1) {
          out.add(sched[i].id);
          out.add(sched[j].id);
        }
      }
    }
    return out;
  }, [bookings]);

  const artistOf = (id: string | null) => artists.find((a) => a.id === id);
  const todayK = dayKey(new Date());
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/6 shadow-sm">
      {/* Week nav */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="text-sm font-semibold">{weekLabel}</div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-md border border-white/12 px-2 py-1 text-xs text-white/75 hover:bg-white/6" aria-label="Previous week">‹</button>
          <button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0} className="rounded-md border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6 disabled:opacity-40">Today</button>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-md border border-white/12 px-2 py-1 text-xs text-white/75 hover:bg-white/6" aria-label="Next week">›</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[840px]">
          {/* Day headers */}
          <div className="grid border-b border-white/10" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
            <div />
            {days.map((d) => {
              const k = dayKey(d);
              return (
                <div key={k} className={`px-2 py-2 text-center ${k === todayK ? "bg-brand-soft" : ""}`}>
                  <div className={`text-[11px] font-medium uppercase tracking-wide ${k === todayK ? "text-brand" : "text-white/55"}`}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className={`text-sm font-semibold ${k === todayK ? "text-brand" : ""}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Grid body */}
          <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
            {/* Hour gutter */}
            <div className="relative" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h, i) => (
                <div key={h} className="absolute right-1.5 text-[10px] text-white/50" style={{ top: i * HOUR_PX - 6 }}>
                  {i === 0 ? "" : h <= 12 ? `${h}a` : `${h - 12}p`}
                </div>
              ))}
            </div>

            {days.map((d) => {
              const k = dayKey(d);
              const dayBookings = byDay.get(k) ?? [];
              return (
                <div
                  key={k}
                  className={`relative border-l border-white/9 ${k === todayK ? "bg-brand-soft/40" : ""}`}
                  style={{ height: hours.length * HOUR_PX }}
                >
                  {/* hour lines */}
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-white/7" style={{ top: i * HOUR_PX }} />
                  ))}
                  {dayBookings.map((b) => {
                    const start = new Date(b.starts_at);
                    const end = b.ends_at ? new Date(b.ends_at) : new Date(start.getTime() + 3_600_000);
                    const startH = start.getHours() + start.getMinutes() / 60;
                    const endH = Math.max(startH + 0.5, end.getHours() + end.getMinutes() / 60);
                    const top = Math.max(0, (startH - DAY_START) * HOUR_PX);
                    const height = Math.max(22, Math.min((endH - startH) * HOUR_PX, hours.length * HOUR_PX - top) - 2);
                    const artist = artistOf(b.artist_id);
                    const color = artist?.color ?? "#999";
                    const clash = conflictIds.has(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => onOpen(b.id)}
                        title={`${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${artist ? ` · ${artist.name}` : ""}${b.service_desc ? ` · ${b.service_desc}` : ""}${clash ? " · ⚠ overlaps another booking" : ""}`}
                        className={`absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-opacity hover:opacity-80 ${clash ? "ring-2 ring-rose-500" : ""}`}
                        style={{ top, height, borderLeftColor: color, backgroundColor: `${color}1a` }}
                      >
                        <span className="block truncate font-semibold text-white/85">
                          {clash ? "⚠ " : ""}
                          {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "")}
                          {b.confirmed_at ? " ✓" : ""}
                        </span>
                        <span className="block truncate text-white/70">{b.service_desc || artist?.name || "Booking"}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Artist legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 px-4 py-2">
        {artists.map((a) => (
          <span key={a.id} className="flex items-center gap-1.5 text-[11px] text-white/65">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}
