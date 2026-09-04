"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// Phone-first sign-in: type your number, get a text code. Email code is the
// fallback (and the account anchor). No passwords anywhere.

// "(209) 555-0144" -> "+12095550144"; returns null if it doesn't look like one.
function e164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [mode, setMode] = useState<"phone" | "email">("email"); // email first until the carrier campaign clears; phone stays one tap away
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That sign-in link didn't work. Try again." : null,
  );

  // Supabase's messages are for developers; the team gets plain English.
  const plain = (m: string) => {
    if (/expired|invalid|otp/i.test(m)) return "That code didn't work. Check it, or send a new one.";
    if (/security purposes|rate limit|too many/i.test(m)) return "Give it a minute, then try again.";
    if (/network|fetch/i.test(m)) return "Couldn't reach the server. Check the connection and try again.";
    return m;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    if (mode === "phone") {
      const p = e164(phone);
      if (!p) {
        setError("That number doesn't look right. Use 10 digits.");
        return;
      }
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({
        phone: p,
        options: { shouldCreateUser: false },
      });
      setBusy(false);
      if (error) {
        setError(
          /signups not allowed|not found/i.test(error.message)
            ? "That number isn't on the team yet. Ask an admin to add you."
            : plain(error.message),
        );
      } else setSent(true);
    } else {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false, // same rule as phone: the team is added in Staff, not here
          emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      setBusy(false);
      if (error) {
        setError(
          /signups not allowed|not found/i.test(error.message)
            ? "That email isn't on the team yet. Ask an admin to add you."
            : plain(error.message),
        );
      } else setSent(true);
    }
  };

  // On success the browser client writes the session cookie; a full navigation
  // lets the server see it.
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } =
      mode === "phone"
        ? await supabase.auth.verifyOtp({ phone: e164(phone)!, token: code.trim(), type: "sms" })
        : await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      setError(plain(error.message));
      return;
    }
    window.location.href = next;
  };

  const reset = () => {
    setCode("");
    setSent(false);
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink antialiased">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LumenatiLogo bg="dark" className="w-32" />
          <div className="mt-2 text-[11px] font-medium uppercase tracking-widest text-white/55">
            Command Center
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/6 p-6 shadow-sm">
          {sent ? (
            <form onSubmit={verify}>
              <div className="mb-1 text-base font-semibold">
                {mode === "phone" ? "Check your texts" : "Check your email"}
              </div>
              <p className="mb-4 text-sm text-white/70">
                We sent a 6-digit code to{" "}
                <span className="font-medium">{mode === "phone" ? phone : email}</span>. Enter it below.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                maxLength={8}
                className="inp mb-3 text-center text-2xl font-bold tracking-[0.4em]"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
              <button
                type="button"
                onClick={reset}
                className="mt-4 block w-full text-center text-sm text-white/70 hover:text-white"
              >
                {mode === "phone" ? "Use a different number" : "Use a different email"}
              </button>
            </form>
          ) : (
            <form onSubmit={submit}>
              <label className="mb-1 block text-xs font-medium text-white/65">
                Team sign-in
              </label>
              {mode === "phone" ? (
                <input
                  type="tel"
                  required
                  autoFocus
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  className="inp mb-3"
                />
              ) : (
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="inp mb-3"
                />
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Sending…" : mode === "phone" ? "Text me a code" : "Email me a code"}
              </button>
              {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setMode((m) => (m === "phone" ? "email" : "phone"));
                  setError(null);
                }}
                className="mt-4 block w-full text-center text-sm text-white/70 hover:text-white"
              >
                {mode === "phone" ? "Use email instead" : "Use phone instead"}
              </button>
              <p className="mt-3 text-center text-sm text-white/70">
                No password needed. Team members only.
              </p>
            </form>
          )}
        </div>

        <a
          href="/"
          className="mt-4 block text-center text-sm text-white/70 hover:text-white"
        >
          ← back to the site
        </a>
      </div>
    </div>
  );
}
