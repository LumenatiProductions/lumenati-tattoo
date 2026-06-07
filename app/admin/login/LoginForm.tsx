"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That sign-in link didn't work. Try again." : null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink antialiased">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LumenatiLogo bg="light" className="w-32" />
          <div className="mt-2 text-[11px] font-medium uppercase tracking-widest text-black/40">
            Command Center
          </div>
        </div>

        <div className="rounded-xl border border-black/8 bg-white p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mb-1 text-base font-semibold">Check your email</div>
              <p className="text-sm text-black/55">
                We sent a sign-in link to <span className="font-medium">{email}</span>.
                Click it to get in.
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label className="mb-1 block text-xs font-medium text-black/50">
                Staff &amp; artist sign-in
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="inp mb-3"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
              {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
              <p className="mt-4 text-center text-xs text-black/40">
                No password needed. Only approved emails can sign in.
              </p>
            </form>
          )}
        </div>

        <a
          href="/"
          className="mt-4 block text-center text-xs text-black/40 hover:text-black/70"
        >
          ← back to the site
        </a>
      </div>
    </div>
  );
}
