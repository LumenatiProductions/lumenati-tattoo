"use client";

import { useState } from "react";

// The public ask-for-time form. POSTs to /api/bookings/request; the desk works
// the inbox on the Bookings page. Honeypot field ("website") stays hidden —
// bots fill it, people never see it.

export default function RequestForm({ artists }: { artists: { id: string; name: string }[] }) {
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    artistId: "",
    idea: "",
    placement: "",
    size: "",
    availability: "",
    website: "", // honeypot
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.name.trim()) return setErr("Tell us your name.");
    if (!f.idea.trim()) return setErr("Tell us about the tattoo you want.");
    if (!f.email.trim() && !f.phone.trim()) return setErr("Leave an email or a mobile number so we can reach you.");

    setBusy(true);
    try {
      const r = await fetch("/api/bookings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Could not send your request — try again.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Connection problem — check your signal and try again.");
    } finally {
      setBusy(false);
    }
  };

  const card = "rounded-2xl border border-black/8 bg-white p-5 shadow-sm";
  const input = "w-full rounded-lg border border-black/12 bg-white px-3 py-2.5 text-sm";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-black/45";

  if (done) {
    return (
      <div className={`${card} text-center`}>
        <div className="text-lg font-semibold text-emerald-700">Request sent.</div>
        <p className="mt-1 text-sm text-zinc-500">
          The shop will look it over and get back to you to lock in a time. Keep an eye on your
          {f.phone.trim() ? " texts" : " inbox"}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={card}>
        <h1 className="text-lg font-bold">Tell us what you want.</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A few details and we&apos;ll get back to you to lock in a time. Deposits are handled once
          your session is confirmed.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>Your name</span>
            <input className={input} value={f.name} onChange={set("name")} autoComplete="name" />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input className={input} value={f.email} onChange={set("email")} inputMode="email" autoComplete="email" />
          </label>
          <label className="block">
            <span className={label}>Mobile</span>
            <input className={input} value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" />
          </label>
        </div>
        {/* Honeypot — humans never see this. */}
        <input
          value={f.website}
          onChange={set("website")}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-px w-px opacity-0"
          placeholder="website"
        />
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">The tattoo</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className={label}>What do you want?</span>
            <textarea
              className={`${input} min-h-28 resize-y`}
              value={f.idea}
              onChange={set("idea")}
              placeholder="Style, subject, reference ideas, color or black and grey…"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Placement</span>
              <input className={input} value={f.placement} onChange={set("placement")} placeholder="Left forearm…" />
            </label>
            <label className="block">
              <span className={label}>Rough size</span>
              <input className={input} value={f.size} onChange={set("size")} placeholder="Palm-sized…" />
            </label>
          </div>
          <label className="block">
            <span className={label}>Artist</span>
            <select className={input} value={f.artistId} onChange={set("artistId")}>
              <option value="">No preference</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>When can you come in?</span>
            <input className={input} value={f.availability} onChange={set("availability")} placeholder="Weekday evenings, any Saturday…" />
          </label>
        </div>
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand px-4 py-3.5 text-base font-bold text-white shadow-sm disabled:opacity-40"
      >
        {busy ? "Sending…" : "Send request"}
      </button>
      <p className="pb-8 text-center text-xs text-zinc-400">
        We&apos;ll only use your contact info to set up your appointment.
      </p>
    </form>
  );
}
