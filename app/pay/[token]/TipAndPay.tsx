"use client";

import { useState } from "react";

// Tip picker + pay button for the public payment portal. Percentages compute
// off the service amount; the final price is still enforced server-side (the
// checkout route clamps the tip and Stripe prices the session). Tattoo deposits
// skip tipping — the tip belongs on the ticket, not the hold.

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const PRESETS = [15, 20, 25] as const;

export default function TipAndPay({
  token,
  amountCents,
  kind,
}: {
  token: string;
  amountCents: number;
  kind: string;
}) {
  const tippable = kind === "ticket" || kind === "other";
  const [pct, setPct] = useState<number | "custom" | null>(tippable ? 20 : null);
  const [custom, setCustom] = useState("");

  const tipCents = !tippable
    ? 0
    : pct === "custom"
      ? Math.max(0, Math.round(Number(custom) * 100) || 0)
      : pct
        ? Math.round((amountCents * pct) / 100)
        : 0;
  const total = amountCents + tipCents;

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
      active ? "border-brand bg-brand text-white" : "border-black/12 bg-white text-black/65 hover:border-black/30"
    }`;

  return (
    <div>
      {tippable && (
        <div className="mt-5">
          <div className="text-xs font-medium uppercase tracking-wide text-black/45">
            Add a tip for your artist
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setPct(pct === p ? null : p)} className={chip(pct === p)}>
                {p}%
                <span className="block text-[10px] font-normal opacity-80">{usd(Math.round((amountCents * p) / 100))}</span>
              </button>
            ))}
            <button type="button" onClick={() => setPct(pct === "custom" ? null : "custom")} className={chip(pct === "custom")}>
              Other
            </button>
          </div>
          {pct === "custom" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-black/50">$</span>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                className="w-24 rounded-lg border border-black/12 px-3 py-2 text-sm"
              />
              <span className="text-xs text-black/40">tip amount</span>
            </div>
          )}
          {tipCents > 0 && (
            <div className="mt-2 text-xs text-black/45">
              {usd(amountCents)} + {usd(tipCents)} tip
            </div>
          )}
        </div>
      )}

      <a
        href={`/pay/${token}/checkout${tipCents > 0 ? `?tip=${tipCents}` : ""}`}
        className="mt-5 block rounded-xl bg-brand py-3 text-center text-sm font-semibold text-white"
      >
        Pay {usd(total)}
      </a>
    </div>
  );
}
