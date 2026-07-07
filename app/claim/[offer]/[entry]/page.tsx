"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The claim page a waitlist text links to. First tap in the whole cohort
// takes the slot; everyone after gets "ooh, you just missed it" and stays on
// the list. States come from /api/claim: open | yours | missed | gone.

type Standing = "loading" | "open" | "yours" | "missed" | "gone" | "error";
type Ctx = { firstName: string | null; artistName: string | null; startsAt: string | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ClaimPage() {
  const params = useParams<{ offer: string; entry: string }>();
  const offer = params?.offer ?? "";
  const entry = params?.entry ?? "";
  const [standing, setStanding] = useState<Standing>("loading");
  const [ctx, setCtx] = useState<Ctx>({ firstName: null, artistName: null, startsAt: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/claim?offer=${encodeURIComponent(offer)}&w=${encodeURIComponent(entry)}`);
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        setCtx({ firstName: d.firstName ?? null, artistName: d.artistName ?? null, startsAt: d.startsAt ?? null });
        setStanding((d.status as Standing) ?? "gone");
      } catch {
        if (alive) setStanding("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [offer, entry]);

  const grab = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer, w: entry }),
      });
      const d = await r.json().catch(() => ({}));
      setStanding((d.status as Standing) ?? "error");
    } catch {
      setStanding("error");
    }
    setBusy(false);
  };

  const slotLine = ctx.startsAt ? when(ctx.startsAt) : "";

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-md">
          <LumenatiLogo bg="dark" className="w-28" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-zinc-400">Open spot</div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        <div className="rounded-2xl border border-black/8 bg-white p-6 text-center shadow-sm">
          {standing === "loading" && <p className="text-sm text-zinc-500">One sec…</p>}
          {standing === "error" && <p className="text-sm text-zinc-500">Something went wrong — try the link again.</p>}

          {standing === "open" && (
            <>
              <h1 className="text-xl font-bold">{ctx.firstName ? `${ctx.firstName}, it's` : "It's"} open right now.</h1>
              <p className="mt-2 text-sm text-zinc-500">
                {slotLine}
                {ctx.artistName ? ` with ${ctx.artistName}` : ""}. First one to grab it gets it.
              </p>
              <button
                onClick={grab}
                disabled={busy}
                className="mt-5 w-full rounded-xl bg-brand px-4 py-4 text-lg font-bold text-white shadow-sm disabled:opacity-40"
              >
                {busy ? "Grabbing…" : "Grab this spot"}
              </button>
            </>
          )}

          {standing === "yours" && (
            <>
              <div className="text-4xl font-black text-brand">✓</div>
              <h1 className="mt-2 text-xl font-bold">It&apos;s yours{ctx.firstName ? `, ${ctx.firstName}` : ""}.</h1>
              <p className="mt-2 text-sm text-zinc-500">
                {slotLine}
                {ctx.artistName ? ` with ${ctx.artistName}` : ""}. You&apos;re on the books — see you there.
              </p>
            </>
          )}

          {standing === "missed" && (
            <>
              <h1 className="text-xl font-bold">Ooh — you just missed it.</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Someone beat you to this one. You&apos;re still on the list, and the next opening will hit your phone the
                same way.
              </p>
            </>
          )}

          {standing === "gone" && (
            <>
              <h1 className="text-xl font-bold">This one&apos;s come and gone.</h1>
              <p className="mt-2 text-sm text-zinc-500">
                The spot filled or the time passed. You&apos;re still on the list for the next one.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
