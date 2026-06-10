"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// Public healed-photo upload, linked from the 14-day follow-up. Same clean
// parent-brand shell as /intake and /pay; the followup uuid in the URL is the
// capability. Images downscale in the browser before upload.

type Status = "loading" | "ready" | "invalid" | "error";

async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That file doesn't look like an image."));
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function HealedPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [ctx, setCtx] = useState<{ clientFirstName: string | null; artistName: string | null } | null>(null);
  const [remaining, setRemaining] = useState(3);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/healed?token=${encodeURIComponent(token)}`);
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok && d.status === "ready") {
          setCtx(d.context ?? null);
          setRemaining(Math.max(0, (d.max ?? 3) - (d.uploaded ?? 0)));
          setSent(d.uploaded ?? 0);
          setStatus("ready");
        } else if (r.status >= 500) setStatus("error");
        else setStatus("invalid");
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = await downscale(file);
      const r = await fetch("/api/healed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imageBase64: dataUrl }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Upload failed — try again.");
        return;
      }
      setSent((s) => s + 1);
      setRemaining((n) => Math.max(0, n - 1));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-md">
          <LumenatiLogo bg="dark" className="w-28" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-zinc-400">Healed photo</div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        <div className="rounded-2xl border border-black/8 bg-white p-6 shadow-sm">
          {status === "loading" && <p className="text-center text-sm text-zinc-500">One sec…</p>}
          {status === "error" && (
            <p className="text-center text-sm text-zinc-500">Something went wrong — refresh and try again.</p>
          )}
          {status === "invalid" && (
            <p className="text-center text-sm text-zinc-500">
              This link isn&apos;t active anymore. Reply to our message and we&apos;ll sort it out.
            </p>
          )}
          {status === "ready" && (
            <>
              <h1 className="text-lg font-bold">
                {ctx?.clientFirstName ? `${ctx.clientFirstName}, show` : "Show"} us how it healed.
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {ctx?.artistName ? `${ctx.artistName} would love to see it healed` : "We would love to see it healed"} —
                good light, straight on, no filter. Up to 3 shots.
              </p>

              {sent > 0 && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {sent} photo{sent === 1 ? "" : "s"} received — thank you!
                </div>
              )}
              {err && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
              )}

              {remaining > 0 ? (
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  className="mt-5 w-full rounded-xl bg-brand px-4 py-3.5 text-base font-bold text-white shadow-sm disabled:opacity-40"
                >
                  {busy ? "Uploading…" : sent > 0 ? "Add another photo" : "Upload your photo"}
                </button>
              ) : (
                <p className="mt-5 text-center text-sm text-zinc-500">That&apos;s the lot — thank you!</p>
              )}
              <input ref={fileInput} type="file" accept="image/*" onChange={pick} className="hidden" />
              <p className="mt-4 text-center text-xs text-zinc-400">
                By uploading you&apos;re okay with the shop using the photo in the artist&apos;s portfolio.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
