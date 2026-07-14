"use client";

import { Suspense, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// "Add your shop" — the SaaS front door (invite-gated by ?code=, checked
// server-side). Rebuilt 2026-07-14 as a guided, one-thing-at-a-time setup that
// feels like a person walking you through it, not a wall of form fields. The
// look (color/page style) is NOT chosen here — it's auto-defaulted and tuned
// later in the product, so signup leads with substance, not swatches. Payments
// are teed up on the finish screen (they connect their bank right after, once
// signed in). Same /api/shops/create contract as before.

// Sensible defaults the shop tunes later in the app — no picker at signup.
const DEFAULT_ACCENT = "#22d3ee";
const DEFAULT_TEMPLATE = "standard";

type StepDef = {
  key: string;
  /** true once this step's answer is good enough to move on. */
  ready: boolean;
  /** optional steps show a "Skip" instead of blocking. */
  optional?: boolean;
};

function StartInner() {
  const code = useSearchParams()?.get("code") ?? "";
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState("");
  const [tagline, setTagline] = useState("");
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

  const emailOk = /.+@.+\..+/.test(ownerEmail.trim());

  const steps: StepDef[] = [
    { key: "name", ready: shopName.trim().length > 1 },
    { key: "tagline", ready: true, optional: true },
    { key: "logo", ready: true, optional: true },
    { key: "crew", ready: true, optional: true },
    { key: "owner", ready: ownerName.trim().length > 0 && emailOk },
  ];
  const last = steps.length - 1;
  const cur = steps[step];

  const next = () => {
    setErr(null);
    if (!cur.ready) return;
    if (step < last) setStep(step + 1);
    else create();
  };
  const back = () => {
    setErr(null);
    if (step > 0) setStep(step - 1);
  };
  // Enter advances single-line steps (not the multi-line crew box).
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter" && cur.ready) {
      e.preventDefault();
      next();
    }
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
        accent: DEFAULT_ACCENT,
        template: DEFAULT_TEMPLATE,
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

  const inputCls =
    "mt-4 w-full rounded-xl border border-white/12 bg-black/30 px-4 py-3.5 text-lg text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white/40";

  return (
    <div className="flex min-h-screen flex-col text-zinc-100" style={{ background: "#0b0b10" }}>
      <style>{`
        @keyframes stepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .step-anim { animation: stepIn 0.32s cubic-bezier(0.22,1,0.36,1); }
      `}</style>

      {/* Slim, calm header — a subtle white glow, not a color the shop hasn't chosen yet. */}
      <header
        className="px-6 pb-6 pt-10 text-center"
        style={{ background: "radial-gradient(70% 120% at 50% -30%, rgba(255,255,255,0.10) 0%, transparent 70%)" }}
      >
        <div className="flex justify-center">
          <LumenatiLogo bg="dark" className="w-20" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-16">
        {done ? (
          <Done url={done.url} invited={done.invited} email={ownerEmail} />
        ) : (
          <>
            {/* Progress dots. */}
            <div className="mb-8 flex items-center justify-center gap-2">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === step ? 24 : 8,
                    background: i <= step ? "#fff" : "rgba(255,255,255,0.18)",
                  }}
                />
              ))}
            </div>

            <div key={step} className="step-anim flex-1">
              {step === 0 && (
                <Field
                  title="First, what's the shop called?"
                  hint="This names your page and everything your crew signs into."
                >
                  <input
                    autoFocus
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    onKeyDown={onEnter}
                    placeholder="Iron Anchor Tattoo"
                    className={inputCls}
                  />
                </Field>
              )}

              {step === 1 && (
                <Field
                  title="How would you describe it, in a line?"
                  hint="Sits under your name on the page. Skip it if you'd rather."
                >
                  <input
                    autoFocus
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    onKeyDown={onEnter}
                    placeholder="Custom tattoos in Portland since 2012"
                    className={inputCls}
                  />
                </Field>
              )}

              {step === 2 && (
                <Field
                  title="Got a logo?"
                  hint="It tops every page. You can add or swap it anytime, skipping is fine."
                >
                  <div className="mt-5 flex items-center gap-4">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo}
                        alt="Shop logo preview"
                        className="rounded-lg bg-black/30 object-contain p-1.5"
                        style={{ height: 56, width: 92 }}
                      />
                    ) : null}
                    <label className="cursor-pointer rounded-xl border border-white/12 bg-black/30 px-4 py-3 font-semibold text-zinc-200 transition-colors hover:border-white/40">
                      {logo ? "Change logo" : "Add your logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => pickLogo(e.target.files?.[0])}
                      />
                    </label>
                    {logo ? (
                      <button onClick={() => setLogo(null)} className="text-sm text-zinc-500 hover:text-zinc-300">
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {logoErr ? <p className="mt-3 text-sm text-rose-300">{logoErr}</p> : null}
                </Field>
              )}

              {step === 3 && (
                <Field
                  title="Who's on the crew?"
                  hint="One name per line. Add a few now or fill it in later, your call."
                >
                  <textarea
                    autoFocus
                    value={artists}
                    onChange={(e) => setArtists(e.target.value)}
                    rows={4}
                    placeholder={"Mia Vane\nOtto Reyes"}
                    className={inputCls}
                  />
                </Field>
              )}

              {step === 4 && (
                <Field title="Last thing. Let's set up your account." hint="This is how you sign in and run the shop.">
                  <input
                    autoFocus
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Your name"
                    className={inputCls}
                  />
                  <input
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    type="email"
                    placeholder="you@yourshop.com"
                    className={inputCls}
                  />
                  <input
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    onKeyDown={onEnter}
                    type="tel"
                    placeholder="Cell (optional)"
                    className={inputCls}
                  />
                  <p className="mt-2.5 text-sm text-zinc-500">
                    Add a cell and you can sign in with a text code instead of email.
                  </p>
                </Field>
              )}
            </div>

            {err && (
              <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
                {err}
              </div>
            )}

            {/* Nav: Back on the left, Skip (optional steps) + primary on the right. */}
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={back}
                disabled={step === 0}
                style={{ visibility: step === 0 ? "hidden" : "visible" }}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
              >
                ← Back
              </button>
              <div className="flex items-center gap-4">
                {cur.optional && (
                  <button onClick={() => setStep(Math.min(step + 1, last))} className="text-sm text-zinc-400 hover:text-zinc-200">
                    Skip
                  </button>
                )}
                <button
                  onClick={next}
                  disabled={!cur.ready || busy}
                  className="rounded-xl bg-white px-7 py-3 text-base font-bold text-black transition-opacity disabled:opacity-30"
                >
                  {busy ? "Setting up…" : step === last ? "Create my shop" : "Continue →"}
                </button>
              </div>
            </div>

            {step === last && (
              <p className="mt-6 text-center text-xs text-zinc-600">
                Next, you&apos;ll connect your bank so you can take cards. Takes about a minute.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// One guided step: a big prompt, a soft hint, and its input(s).
function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
      {hint ? <p className="mt-2 text-sm leading-relaxed text-zinc-400">{hint}</p> : null}
      {children}
    </div>
  );
}

// The finish screen. Card sales come next (they sign in, then link their bank),
// so payments are the headline of the next step, not an afterthought.
function Done({ url, invited, email }: { url: string; invited: boolean; email: string }) {
  return (
    <div className="step-anim mt-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-3xl text-emerald-400">
        ✓
      </div>
      <h2 className="mt-4 text-2xl font-bold">Your shop is live.</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
        {invited
          ? `Your page is up right now, and a sign-in link is on its way to ${email}.`
          : `Your page is up right now. The invite email didn't go through. Sign in at /admin/login with ${email} and a code will be emailed to you.`}
      </p>

      <a
        href={url}
        className="mt-6 inline-block rounded-xl bg-white px-8 py-3.5 text-base font-bold text-black"
      >
        See your page
      </a>
      <div className="mt-2 text-xs text-zinc-600">{url}</div>

      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left">
        <div className="text-sm font-bold text-white">Next: get paid</div>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          Sign in from that link, then connect your bank. Card sales flow straight to you, clients
          cover the card fee, and you keep 100% of every rate.
        </p>
      </div>
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
