"use client";

import { useState } from "react";

// Mint a public pay link (/pay/<token>) from the desk and hand it to the client:
// copy it, text it, or email it. Wraps POST /api/payments — the same non-expiring
// token the client pays at their leisure (card data never touches our origin).
// Deposits hold the spot; tickets are the work; "other" is a misc charge.

type Kind = "deposit" | "ticket" | "other";
const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: "deposit", label: "Deposit", hint: "Holds the appointment" },
  { id: "ticket", label: "Ticket", hint: "The tattoo itself (tippable)" },
  { id: "other", label: "Other", hint: "Any misc charge" },
];

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PayLinkDialog({
  onClose,
  bookingId,
  clientId,
  artistId,
  clientPhone,
  clientEmail,
  defaultKind = "deposit",
  defaultAmountCents,
  who,
}: {
  onClose: () => void;
  bookingId?: string | null;
  clientId?: string | null;
  artistId?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  defaultKind?: Kind;
  defaultAmountCents?: number;
  /** Display name for the heading ("Pay link for Jane"). */
  who?: string | null;
}) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [amount, setAmount] = useState(defaultAmountCents ? String(defaultAmountCents / 100) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cents = Math.round(parseFloat(amount) * 100) || 0;
  const valid = cents >= 50;

  const create = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, clientId, artistId, kind, amountCents: cents }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) {
        setErr(d.error || "Could not create the link.");
      } else {
        setUrl(d.url as string);
      }
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is selectable in the field */
    }
  };

  const smsText = url
    ? `Lumenati Tattoo · ${KINDS.find((k) => k.id === kind)?.label.toLowerCase()} for ${usd(cents)}: ${url}`
    : "";

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-left transition-colors ${
      active ? "border-brand bg-brand text-white" : "border-white/15 bg-white/6 text-white/85 hover:border-white/35"
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white/6 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Pay link{who ? ` for ${who}` : ""}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/7">
            Close
          </button>
        </div>

        {url ? (
          <div>
            <div className="rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
              Link ready. Send it to the client. They can pay anytime; it never expires.
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-white/15 bg-white/4 px-3 py-2 text-xs text-white/85"
              />
              <button
                onClick={copy}
                className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {clientPhone && (
                <a
                  href={`sms:${clientPhone}?&body=${encodeURIComponent(smsText)}`}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/85 hover:border-white/35"
                >
                  Text it
                </a>
              )}
              {clientEmail && (
                <a
                  href={`mailto:${clientEmail}?subject=${encodeURIComponent("Your Lumenati payment link")}&body=${encodeURIComponent(smsText)}`}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/85 hover:border-white/35"
                >
                  Email it
                </a>
              )}
              <button
                onClick={() => {
                  setUrl(null);
                  setAmount("");
                }}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/70 hover:border-white/35"
              >
                New link
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-white/60">For</div>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => setKind(k.id)} className={chip(kind === k.id)}>
                  <div className="text-sm font-semibold">{k.label}</div>
                  <div className={`text-[10px] ${kind === k.id ? "text-white/80" : "text-white/55"}`}>{k.hint}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 text-[11px] font-medium uppercase tracking-wide text-white/60">Amount</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-bold text-white/55">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                className="w-full rounded-lg border border-white/15 px-3 py-2 text-lg font-semibold"
              />
            </div>

            {err && <div className="mt-3 rounded-lg bg-rose-400/10 px-3 py-2 text-xs text-rose-300">{err}</div>}

            <button
              onClick={create}
              disabled={!valid || busy}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Creating…" : valid ? `Create link for ${usd(cents)}` : "Enter an amount"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
