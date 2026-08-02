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
      className={`glass rounded-xl shadow-sm ${className}`}
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

/**
 * Page top: title, one-line subtitle, optional right-side actions. Canonical
 * layout taken from the Bookings page; every admin page should use this so
 * headers stay in lockstep.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-white/65">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/** The standard stat-tile grid under a page header: 2-up on phones, 4-up on desktop. */
export function StatRow({
  children,
  cols = 4,
}: {
  children: ReactNode;
  cols?: 3 | 4;
}) {
  return (
    <div
      className={`mb-5 grid grid-cols-2 gap-3 ${cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
    >
      {children}
    </div>
  );
}

/**
 * The standard filter chip row. Selection is a white lift (never pink) - the
 * one look for segmented choices everywhere in the admin.
 */
export function FilterChips<K extends string>({
  filters,
  value,
  onChange,
}: {
  filters: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            value === f.key
              ? "bg-white/14 text-white"
              : "border border-white/12 text-white/70 hover:bg-white/6"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** The standard empty state: a quiet centered line inside a Card. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <div className="px-4 py-10 text-center text-sm text-white/55">{children}</div>
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

/**
 * The standard admin table set. One source for head/row/cell styling so
 * tables read identically on every page (head at white/60, th py-2, td py-2.5).
 */
export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full text-sm">{children}</table>;
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/60">
        {children}
      </tr>
    </thead>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`px-4 py-2 font-medium ${className}`}>{children}</th>;
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`border-b border-white/8 last:border-0 ${className}`}>{children}</tr>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
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
        {source} not connected yet. These figures are placeholders.
      </span>
    </div>
  );
}
