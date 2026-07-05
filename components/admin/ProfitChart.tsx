"use client";

import { useMemo, useState } from "react";

// Profit by period as diverging columns around a zero baseline — green above,
// rose below (pair validated for contrast + colorblind separation on white).
// Pure SVG: hover any column for the period's exact figure; the biggest
// swing in each direction is labeled directly.

type Point = { key: string; label: string; profit: number };

const POS = "#059669";
const NEG = "#e11d48";
const H = 190;
const PAD_TOP = 26;
const PAD_BOTTOM = 24;
const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function ProfitChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { cols, zeroY, top, bottom, maxIdx, minIdx } = useMemo(() => {
    const vals = points.map((p) => p.profit);
    const hi = Math.max(0, ...vals);
    const lo = Math.min(0, ...vals);
    const span = Math.max(1, hi - lo);
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    const y = (v: number) => PAD_TOP + ((hi - v) / span) * plotH;
    const zero = y(0);
    let maxI = -1;
    let minI = -1;
    vals.forEach((v, i) => {
      if (v > 0 && (maxI < 0 || v > vals[maxI])) maxI = i;
      if (v < 0 && (minI < 0 || v < vals[minI])) minI = i;
    });
    return {
      cols: points.map((p, i) => ({ ...p, y: y(p.profit), i })),
      zeroY: zero,
      top: hi,
      bottom: lo,
      maxIdx: maxI,
      minIdx: minI,
    };
  }, [points]);

  if (points.length === 0) return null;

  // Layout: fixed 100-unit viewBox width scales to the card; columns capped
  // thin with a consistent gap (never fill the slot).
  const VW = 1000;
  const slot = VW / points.length;
  const barW = Math.min(24, slot * 0.6);

  return (
    <div
      className="relative"
      role="img"
      aria-label={`Profit by period: ${points.map((p) => `${p.label} ${usd(p.profit)}`).join(", ")}. Range ${usd(bottom)} to ${usd(top)}.`}
    >
      <svg viewBox={`0 0 ${VW} ${H}`} className="block w-full" preserveAspectRatio="none" aria-hidden>
        {/* zero baseline — the one line that matters */}
        <line x1={0} y1={zeroY} x2={VW} y2={zeroY} stroke="rgba(0,0,0,0.18)" strokeWidth={1} />
        {cols.map((c) => {
          const up = c.profit >= 0;
          const rawH = Math.abs(c.y - zeroY);
          const h = c.profit === 0 ? 0 : Math.max(3, rawH);
          const yTop = up ? zeroY - h : zeroY;
          const x = c.i * slot + (slot - barW) / 2;
          const r = Math.min(4, h);
          // Rounded at the data end, square at the baseline.
          const d = up
            ? `M ${x} ${yTop + h} L ${x} ${yTop + r} Q ${x} ${yTop} ${x + r} ${yTop} L ${x + barW - r} ${yTop} Q ${x + barW} ${yTop} ${x + barW} ${yTop + r} L ${x + barW} ${yTop + h} Z`
            : `M ${x} ${yTop} L ${x + barW} ${yTop} L ${x + barW} ${yTop + h - r} Q ${x + barW} ${yTop + h} ${x + barW - r} ${yTop + h} L ${x + r} ${yTop + h} Q ${x} ${yTop + h} ${x} ${yTop + h - r} Z`;
          return (
            <g key={c.key}>
              {c.profit !== 0 && (
                <path d={d} fill={up ? POS : NEG} opacity={hover === null || hover === c.i ? 1 : 0.45} />
              )}
              {/* full-height hit target so hover doesn't require pixel aim */}
              <rect
                x={c.i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(c.i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {/* direct labels: biggest month up and biggest month down */}
      {[maxIdx, minIdx]
        .filter((i) => i >= 0 && hover === null)
        .map((i) => {
          const c = cols[i];
          const up = c.profit >= 0;
          return (
            <div
              key={c.key}
              className="pointer-events-none absolute -translate-x-1/2 text-[11px] font-semibold tnum text-black/70"
              style={{
                left: `${((c.i + 0.5) / points.length) * 100}%`,
                top: up ? `${(Math.min(c.y, zeroY) / H) * 100}%` : undefined,
                bottom: up ? undefined : `${((H - Math.max(c.y, zeroY)) / H) * 100}%`,
                transform: `translate(-50%, ${up ? "-115%" : "115%"})`,
              }}
            >
              {usd(c.profit)}
            </div>
          );
        })}

      {/* hover tooltip */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
        >
          <span className="font-medium">{points[hover].label}</span>{" "}
          <span className={`tnum font-semibold ${points[hover].profit < 0 ? "text-rose-600" : "text-emerald-700"}`}>
            {usd(points[hover].profit)}
          </span>
        </div>
      )}

      {/* x labels: first, last, and a few in between */}
      <div className="mt-1 flex justify-between text-[11px] text-black/40">
        <span>{points[0].label}</span>
        {points.length > 4 && <span>{points[Math.floor(points.length / 2)].label}</span>}
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
