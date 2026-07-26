"use client";

import { useRef, useState } from "react";

// The public ask-for-time form. POSTs to /api/bookings/request; the desk works
// the inbox on the Bookings page. Honeypot field ("website") stays hidden —
// bots fill it, people never see it.
//
// Reference images: picked files are downscaled in the browser (canvas, max
// 1600px JPEG) so uploads stay tiny, then sent to the upload route one at a
// time on submit. Up to 3.

const MAX_REFS = 3;

// Downscale a picked image to a JPEG data URL the API will accept.
async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That file doesn't look like an image."));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function RequestForm({
  artists,
  shopSlug,
  preselectArtistId,
  accent = "#ff1493",
  initialIdea,
  flashPiece,
}: {
  artists: { id: string; name: string; booksClosed?: boolean }[];
  shopSlug?: string;
  preselectArtistId?: string;
  accent?: string;
  initialIdea?: string;
  // Set when the visitor tapped a flash piece — rendered above the form so
  // they can see exactly what they're claiming.
  flashPiece?: { src: string; title: string; price: string | null };
}) {
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    artistId: preselectArtistId ?? "",
    idea: initialIdea ?? "",
    placement: "",
    size: "",
    availability: "",
    website: "", // honeypot
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<false | "sent" | "waitlisted">(false);
  const [err, setErr] = useState<string | null>(null);
  // Reference images, held as downscaled data URLs until submit.
  const [refs, setRefs] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const pickRefs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_REFS - refs.length);
    e.target.value = ""; // allow re-picking the same file
    setErr(null);
    for (const file of files) {
      try {
        const dataUrl = await downscale(file);
        setRefs((r) => (r.length < MAX_REFS ? [...r, dataUrl] : r));
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "Could not read that image.");
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.name.trim()) return setErr("Tell us your name.");
    if (!f.idea.trim()) return setErr("Tell us about the tattoo you want.");
    if (!f.email.trim() && !f.phone.trim()) return setErr("Leave an email or a mobile number so we can reach you.");

    setBusy(true);
    try {
      // Upload references first; a failed upload warns but never blocks the ask.
      const referenceUrls: string[] = [];
      let refWarning: string | null = null;
      for (const dataUrl of refs) {
        try {
          const r = await fetch("/api/bookings/request/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: dataUrl }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok && (d.path || d.url)) referenceUrls.push(d.path || d.url);
          else refWarning = d.error || "Some reference photos didn't upload.";
        } catch {
          refWarning = "Some reference photos didn't upload.";
        }
      }

      const r = await fetch("/api/bookings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, referenceUrls, ...(shopSlug ? { shopSlug } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Could not send your request — try again.");
        return;
      }
      if (refWarning && refs.length > 0 && referenceUrls.length === 0) {
        // The request itself made it; just be honest about the photos.
        setErr(null);
      }
      setDone(d.waitlisted ? "waitlisted" : "sent");
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
    const waitlisted = done === "waitlisted";
    return (
      <div className={`${card} text-center`}>
        <div className="text-lg font-semibold" style={{ color: accent }}>
          {waitlisted ? "You're on the waitlist." : "Request sent."}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {waitlisted
            ? "Their books are closed right now, so you're in line. The moment a spot opens you'll hear from the shop first."
            : "The shop will look it over and get back to you to lock in a time."}{" "}
          Keep an eye on your
          {f.phone.trim() ? " texts" : " inbox"}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {flashPiece && (
        <div className={`${card} flex items-center gap-4`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flashPiece.src} alt={flashPiece.title || "flash"} className="h-16 w-16 rounded-lg border border-black/10 object-cover" />
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-black/45">Claiming this flash</div>
            <div className="truncate text-sm font-semibold">
              {flashPiece.title || "One-off design"}
              {flashPiece.price ? <span style={{ color: accent }}> · {flashPiece.price}</span> : null}
            </div>
          </div>
        </div>
      )}
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
                  {a.booksClosed ? " — books closed (waitlist)" : ""}
                </option>
              ))}
            </select>
            {artists.find((a) => a.id === f.artistId)?.booksClosed ? (
              <p className="mt-1.5 text-xs text-zinc-500">
                Their books are closed right now — sending this puts you on their waitlist, first in
                line when a spot opens.
              </p>
            ) : null}
          </label>
          <label className="block">
            <span className={label}>When can you come in?</span>
            <input className={input} value={f.availability} onChange={set("availability")} placeholder="Weekday evenings, any Saturday…" />
          </label>

          {/* Style references */}
          <div>
            <span className={label}>Reference photos (optional, up to {MAX_REFS})</span>
            <p className="mb-2 text-xs text-zinc-400">
              Styles you like, the spot on your body, or art you want worked in.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {refs.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Reference ${i + 1}`} className="h-20 w-20 rounded-lg border border-black/10 object-cover" />
                  <button
                    type="button"
                    onClick={() => setRefs((r) => r.filter((_, j) => j !== i))}
                    aria-label="Remove this reference"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-white shadow"
                  >
                    ×
                  </button>
                </div>
              ))}
              {refs.length < MAX_REFS && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border border-dashed border-black/20 text-zinc-400 hover:border-black/40 hover:text-zinc-600"
                >
                  <span className="text-xl leading-none">+</span>
                  <span className="mt-1 text-[10px]">Add photo</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                onChange={pickRefs}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <button
        type="submit"
        disabled={busy}
        style={{ backgroundColor: accent }}
        className="w-full rounded-xl px-4 py-3.5 text-base font-bold text-white shadow-sm disabled:opacity-40"
      >
        {busy ? "Sending…" : "Send request"}
      </button>
      <p className="pb-8 text-center text-xs text-zinc-400">
        We&apos;ll only use your contact info to set up your appointment.
      </p>
    </form>
  );
}
