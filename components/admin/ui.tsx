import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 border-t-white/20 bg-white/6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneText =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-ink";
  return (
    <Card className={accent ? "ring-1 ring-brand/30" : ""}>
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-white/60">
          {label}
        </div>
        <div className={`tnum mt-1 text-2xl font-semibold ${toneText}`}>
          {value}
        </div>
        {sub && <div className="mt-0.5 text-xs text-white/60">{sub}</div>}
      </div>
    </Card>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
}) {
  const map: Record<string, string> = {
    neutral: "bg-white/8 text-white/75",
    good: "bg-emerald-400/15 text-emerald-300",
    warn: "bg-amber-400/15 text-amber-300",
    bad: "bg-rose-400/15 text-rose-300",
    brand: "bg-brand-soft text-brand",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/** A "this is mock data" notice while integrations aren't connected. */
export function MockBanner({ source }: { source: string }) {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
      <span className="font-semibold">Preview data</span>
      <span className="text-amber-300/80">
        — {source} not connected yet. These figures are placeholders.
      </span>
    </div>
  );
}
