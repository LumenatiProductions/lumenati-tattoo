"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// "Add your shop" — the SaaS front door (invite-gated by ?code=, checked
// server-side). One page, three beats: the shop, the crew, the owner. On
// success it points at the live public page and the invite email.

const SWATCHES = ["#ff1493", "#22d3ee", "#34d399", "#f59e0b", "#a78bfa", "#f43f5e"];

function StartInner() {
  const code = useSearchParams()?.get("code") ?? "";
  const [shopName, setShopName] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState(SWATCHES[1]);
  const [artists, setArtists] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; slug: string; invited: boolean } | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/shops/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        shopName,
        tagline,
        accent,
        ownerEmail,
        ownerName,
        artists: artists.split("\n"),
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(d.error ?? "Something went wrong.");
      return;
    }
    setDone({ url: d.url, slug: d.slug, invited: !!d.invited });
  };

  return (
    <div className="min-h-screen text-zinc-100" style={{ background: "#0b0b10" }}>
      <header className="px-6 pb-8 pt-12 text-center" style={{ background: `radial-gradient(80% 130% at 50% -20%, ${accent}33 0%, transparent 70%)` }}>
        <div className="flex justify-center">
          <LumenatiLogo bg="dark" className="w-24" />
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">Add your shop</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
          Registers, books, bookings, and an artist app your crew will actually like — set up in two minutes.
        </p>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-16">
        {done ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <div className="text-3xl font-black" style={{ color: accent }}>✓</div>
            <h2 className="mt-2 text-xl font-bold">Your shop is live.</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {done.invited
                ? `The public page is up right now, and the sign-in invite is on its way to ${ownerEmail}.`
                : `The public page is up right now. The invite email didn't go through — sign in at /admin/login with ${ownerEmail} and a code will be emailed to you.`}
            </p>
            <a href={done.url} className="mt-5 inline-block rounded-xl px-8 py-3.5 text-base font-bold text-white" style={{ background: accent }}>
              See your page
            </a>
            <div className="mt-3 text-xs text-zinc-500">{done.url}</div>
          </div>
        ) : (
          <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <label className="block text-sm">
              <span className="text-zinc-400">Shop name</span>
              <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Iron Anchor Tattoo"
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-base text-white outline-none focus:border-white/30" />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400">One-liner (optional)</span>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Custom tattoos in Portland since 2012"
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-base text-white outline-none focus:border-white/30" />
            </label>
            <div className="text-sm">
              <span className="text-zinc-400">Your color</span>
              <div className="mt-2 flex gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} onClick={() => setAccent(c)} aria-label={c}
                    className="h-9 w-9 rounded-full border-2"
                    style={{ background: c, borderColor: accent === c ? "#fff" : "transparent" }} />
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Your pages start on the clean standard look. Want a fully custom skin like Lumenati&apos;s? That&apos;s a
                conversation — everything underneath stays the same.
              </p>
            </div>
            <label className="block text-sm">
              <span className="text-zinc-400">Artists — one per line</span>
              <textarea value={artists} onChange={(e) => setArtists(e.target.value)} rows={4} placeholder={"Mia Vane\nOtto Reyes"}
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-base text-white outline-none focus:border-white/30" />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-zinc-400">Your name</span>
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Sam Ortiz"
                  className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-base text-white outline-none focus:border-white/30" />
              </label>
              <label className="block text-sm">
                <span className="text-zinc-400">Your email</span>
                <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="sam@ironanchor.com" type="email"
                  className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-base text-white outline-none focus:border-white/30" />
              </label>
            </div>
            {err && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">{err}</div>}
            <button onClick={create} disabled={busy}
              className="w-full rounded-xl px-4 py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? "Setting up your shop…" : "Create my shop"}
            </button>
            <p className="text-center text-xs text-zinc-500">
              Invite-only while we onboard the first shops — the link you got includes your code.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense>
      <StartInner />
    </Suspense>
  );
}
