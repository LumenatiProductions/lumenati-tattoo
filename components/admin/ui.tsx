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
      className={`rounded-xl border border-black/8 bg-white shadow-sm ${className}`}
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
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-ink";
  return (
    <Card className={accent ? "ring-1 ring-brand/30" : ""}>
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-black/45">
          {label}
        </div>
        <div className={`tnum mt-1 text-2xl font-semibold ${toneText}`}>
          {value}
        </div>
        {sub && <div className="mt-0.5 text-xs text-black/45">{sub}</div>}
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">
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
    neutral: "bg-black/6 text-black/60",
    good: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    bad: "bg-rose-100 text-rose-700",
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
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span className="font-semibold">Preview data</span>
      <span className="text-amber-700/80">
        — {source} not connected yet. These figures are placeholders.
      </span>
    </div>
  );
}
