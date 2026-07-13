"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// "Add your shop" — the SaaS front door (invite-gated by ?code=, checked
// server-side). One page, three beats: the shop, the crew, the owner. On
// success it points at the live public page and the invite email.

const SWATCHES = ["#ff1493", "#22d3ee", "#34d399", "#f59e0b", "#a78bfa", "#f43f5e"];

// The three page styles a new shop can start on (same set as the app's
// Page style card; Lumenati's Y2K skin isn't on the menu).
const STYLES = [
  { key: "standard", name: "Standard", blurb: "Clean and simple. The work leads." },
  { key: "dark", name: "Dark ink", blurb: "Smoke and hairlines. Built for blackwork." },
  { key: "flash", name: "Flash sheet", blurb: "The sheet is the page. Claim per piece." },
] as const;

function StartInner() {
  const code = useSearchParams()?.get("code") ?? "";
  const [shopName, setShopName] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState(SWATCHES[1]);
  const [template, setTemplate] = useState<string>("standard");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [artists, setArtists] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; slug: string; invited: boolean } | null>(null);

  const pickLogo = (file: File | undefined) => {
    setLogoErr(null);
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setLogoErr("That file is over 3MB. Export a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

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
        template,
        logo,
        ownerEmail,
        ownerName,
        ownerPhone,
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
          Registers, books, bookings, and an artist app your crew will actually like. Set up in two minutes.
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
                : `The public page is up right now. The invite email didn't go through. Sign in at /admin/login with ${ownerEmail} and a code will be emailed to you.`}
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
            </div>
            <div className="text-sm">
              <span className="text-zinc-400">Page style</span>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {STYLES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setTemplate(s.key)}
                    className="rounded-xl border px-3 py-2.5 text-left"
                    style={{
                      borderColor: template === s.key ? accent : "rgba(255,255,255,0.12)",
                      background: template === s.key ? `${accent}1a` : "rgba(0,0,0,0.3)",
                    }}
                  >
                    <div className="font-bold text-white">{s.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">{s.blurb}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                You can switch styles any time. Want a fully custom skin like Lumenati&apos;s? That&apos;s a
                conversation. Everything underneath stays the same.
              </p>
            </div>
            <div className="text-sm">
              <span className="text-zinc-400">Shop logo (optional)</span>
              <div className="mt-2 flex items-center gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Shop logo preview" className="rounded-lg bg-black/30 object-contain p-1" style={{ height: 44, width: 72 }} />
                ) : null}
                <label className="cursor-pointer rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 font-semibold text-zinc-300 hover:border-white/30">
                  {logo ? "Change logo" : "Add your logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => pickLogo(e.target.files?.[0])}
                  />
                </label>
                {logo ? (
                  <button onClick={() => setLogo(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                    Remove
                  </button>
                ) : null}
              </div>
              {logoErr ? <p className="mt-2 text-xs text-rose-300">{logoErr}</p> : null}
              <p className="mt-2 text-xs text-zinc-500">It tops every page. You can add or swap it later.</p>
            </div>
            <label className="block text-sm">
              <span className="text-zinc-400">Artists, one per line</span>
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
            <label className="block text-sm">
              <span className="text-zinc-400">Your cell (optional)</span>
              <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="(303) 555-0144" type="tel"
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-base text-white outline-none focus:border-white/30" />
              <p className="mt-1.5 text-xs text-zinc-500">With a cell on file you can sign in with a text code instead of email.</p>
            </label>
            {err && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">{err}</div>}
            <button onClick={create} disabled={busy}
              className="w-full rounded-xl px-4 py-4 text-lg font-bold text-white disabled:opacity-40" style={{ background: accent }}>
              {busy ? "Setting up your shop…" : "Create my shop"}
            </button>
            <p className="text-center text-xs text-zinc-500">
              Invite-only while we onboard the first shops. The link you got includes your code.
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
