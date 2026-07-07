"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The client's aftercare timeline (item 5 — portfolio autopilot's pretty
// surface). Linked from the aftercare email the follow-up engine sends the
// evening of the visit. Day-by-day care with TODAY highlighted, the day-14
// healed-photo ask wired to their upload link, and the rebook nudge at the
// end pointing at the artist's public page. One page a client keeps opening
// for a month — and every open ends at "book the next one".

type Status = "loading" | "ready" | "invalid" | "error";
type Ctx = {
  clientFirstName: string | null;
  artistName: string | null;
  artistSlug: string | null;
  artistColor: string | null;
  service: string;
  visitDate: string;
  healedToken: string | null;
};

type Stage = {
  from: number; // day range, inclusive
  to: number; // Infinity for the last
  label: string;
  title: string;
  points: string[];
};

const STAGES: Stage[] = [
  {
    from: 0,
    to: 1,
    label: "Days 0–1",
    title: "Fresh",
    points: [
      "Leave the wrap on exactly as long as your artist told you.",
      "Wash gently with clean hands and unscented soap, then pat dry — never rub.",
      "Sleep on clean sheets; keep pets and gym grime away from it.",
    ],
  },
  {
    from: 2,
    to: 3,
    label: "Days 2–3",
    title: "Settling in",
    points: [
      "Wash morning and night, thin layer of the ointment your artist recommended.",
      "Thin means thin — the skin needs to breathe.",
      "A little oozing and redness is normal.",
    ],
  },
  {
    from: 4,
    to: 6,
    label: "Days 4–6",
    title: "The itch",
    points: [
      "Switch to a fragrance-free lotion when it starts feeling tight.",
      "Itching means healing. Do not scratch, slap it if you must.",
      "Still no pools, hot tubs, or long soaks.",
    ],
  },
  {
    from: 7,
    to: 13,
    label: "Days 7–13",
    title: "Peeling",
    points: [
      "Flaking and dullness are normal — the color comes back.",
      "Let every flake fall off on its own; picking pulls ink.",
      "Keep it moisturized and out of direct sun.",
    ],
  },
  {
    from: 14,
    to: 29,
    label: "Day 14",
    title: "Show it off",
    points: [
      "The surface should be healed — this is the photo moment.",
      "Good light, straight on, no filter.",
    ],
  },
  {
    from: 30,
    to: Infinity,
    label: "Day 30 and on",
    title: "Healed",
    points: [
      "Fully settled. Sunscreen on it from now on, forever — sun is what ages tattoos.",
      "Thinking about the next piece? That's what the button below is for.",
    ],
  },
];

const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function CarePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [ctx, setCtx] = useState<Ctx | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/care?token=${encodeURIComponent(token)}`);
        if (!alive) return;
        if (!r.ok) {
          setStatus("invalid");
          return;
        }
        const d = (await r.json()) as Ctx & { status: string };
        setCtx(d);
        setStatus("ready");
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const accent = ctx?.artistColor || "#ff1493";
  const day = ctx ? Math.max(0, Math.floor((Date.now() - new Date(ctx.visitDate).getTime()) / 86_400_000)) : 0;
  const stageIndex = STAGES.findIndex((s) => day >= s.from && day <= s.to);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-md">
          <LumenatiLogo bg="dark" className="w-28" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-zinc-400">Aftercare</div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        {status === "loading" && <p className="text-center text-sm text-zinc-500">One sec…</p>}
        {status === "error" && (
          <p className="text-center text-sm text-zinc-500">Something went wrong — refresh and try again.</p>
        )}
        {status === "invalid" && (
          <p className="text-center text-sm text-zinc-500">
            This link isn&apos;t active anymore. Reply to our message and we&apos;ll sort it out.
          </p>
        )}
        {status === "ready" && ctx && (
          <>
            <div className="rounded-2xl border border-black/8 bg-white p-6 shadow-sm">
              <h1 className="text-xl font-bold">
                {ctx.clientFirstName ? `${ctx.clientFirstName}, your` : "Your"} new tattoo
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {ctx.service ? `${ctx.service} · ` : ""}
                {ctx.artistName ? `by ${ctx.artistName} · ` : ""}
                {prettyDate(ctx.visitDate)}
              </p>
              <div
                className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold"
                style={{ background: "#ffe3f1", color: "#9d1252" }}
              >
                Day {day} — {STAGES[stageIndex]?.title ?? "Healed"}
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                General guidance — whatever {ctx.artistName ?? "your artist"} told you in the chair always wins.
              </p>
            </div>

            <div className="mt-6">
              {STAGES.map((s, i) => {
                const state = i < stageIndex ? "done" : i === stageIndex ? "now" : "later";
                return (
                  <div key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* rail */}
                    {i < STAGES.length - 1 && (
                      <div className="absolute left-[9px] top-6 bottom-0 w-px bg-zinc-300" aria-hidden />
                    )}
                    <div
                      className="mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-2"
                      style={
                        state === "now"
                          ? { background: accent, borderColor: accent }
                          : state === "done"
                            ? { background: "#d4d4d8", borderColor: "#d4d4d8" }
                            : { background: "#fff", borderColor: "#d4d4d8" }
                      }
                    />
                    <div
                      className={`flex-1 rounded-xl border p-4 ${
                        state === "now" ? "border-black/10 bg-white shadow-sm" : "border-black/5 bg-white/60"
                      } ${state === "later" ? "opacity-70" : ""}`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        {s.label}
                      </div>
                      <div className="mt-0.5 font-bold" style={state === "now" ? { color: accent } : undefined}>
                        {s.title}
                        {state === "done" ? " ✓" : ""}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                        {s.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                      {s.from === 14 && ctx.healedToken && (
                        <a
                          href={`/healed/${ctx.healedToken}`}
                          className={`mt-3 block rounded-xl px-4 py-3 text-center text-sm font-bold text-white ${
                            day >= 12 ? "" : "pointer-events-none opacity-40"
                          }`}
                          style={{ background: accent }}
                        >
                          {day >= 12 ? "Upload your healed photo" : "Unlocks around day 14"}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {ctx.artistSlug && (
              <div className="mt-6 rounded-2xl border border-black/8 bg-white p-6 text-center shadow-sm">
                <div className="font-bold">Already thinking about the next one?</div>
                <p className="mt-1 text-sm text-zinc-500">
                  {ctx.artistName ?? "Your artist"} is booking now.
                </p>
                <a
                  href={`/${ctx.artistSlug}`}
                  className="mt-4 block rounded-xl px-4 py-3.5 text-base font-bold text-white"
                  style={{ background: accent }}
                >
                  Book with {ctx.artistName ?? "them"}
                </a>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
