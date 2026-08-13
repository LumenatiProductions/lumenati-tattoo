"use client";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { PageHead } from "@/components/admin/home/shared";
import { Card, Badge } from "@/components/admin/ui";

// The Grok Bot <-> Claude QA board. Grok files findings (status=new); Claude
// fixes them and stamps the commit; Grok re-verifies. Reads the qa_findings
// table via /api/qa/findings. Owner-only. See qa/README.md.

type Status = "new" | "fixed" | "verified" | "reopened" | "wontfix";
type Severity = "P0" | "P1" | "P2" | "P3";

type Finding = {
  id: number;
  ext_id: string | null;
  surface: string;
  severity: Severity;
  finding: string;
  repro: string | null;
  status: Status;
  owner: string | null;
  commit_sha: string | null;
  note: string | null;
  updated_at: string;
};

// Column order = the loop: reopened + new need a fix, fixed awaits Grok, done sinks.
const COLUMNS: { key: Status; title: string }[] = [
  { key: "reopened", title: "Reopened" },
  { key: "new", title: "New · needs a fix" },
  { key: "fixed", title: "Fixed · awaiting verify" },
  { key: "verified", title: "Verified" },
  { key: "wontfix", title: "Won't fix" },
];

const SEV_TONE: Record<Severity, "neutral" | "warn" | "bad"> = {
  P0: "bad",
  P1: "warn",
  P2: "neutral",
  P3: "neutral",
};

// Status is the headline signal on every card: a solid badge plus a matching
// bar down the side, echoed in the column color. Owner stays muted grey so a
// green card reads as "done", never as "who".
const STATUS_STYLE: Record<Status, { label: string; badge: string; bar: string }> = {
  new: { label: "New", badge: "bg-amber-500 text-black", bar: "bg-amber-500" },
  fixed: { label: "Fixed", badge: "bg-sky-500 text-white", bar: "bg-sky-500" },
  verified: { label: "Verified", badge: "bg-emerald-500 text-black", bar: "bg-emerald-500" },
  reopened: { label: "Reopened", badge: "bg-rose-500 text-white", bar: "bg-rose-500" },
  wontfix: { label: "Won't fix", badge: "bg-white/20 text-white/70", bar: "bg-white/20" },
};

const COL_ACCENT: Record<Status, string> = {
  reopened: "text-rose-400",
  new: "text-amber-400",
  fixed: "text-sky-400",
  verified: "text-emerald-400",
  wontfix: "text-white/40",
};

const OWNER_LABEL: Record<string, string> = { grokbot: "Grok Bot", claude: "Claude", scott: "Scott" };

function ago(iso: string): string {
  const secs = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function FindingCard({ f }: { f: Finding }) {
  const s = STATUS_STYLE[f.status];
  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <span className={`absolute left-0 top-0 h-full w-1.5 ${s.bar}`} />
        <div className="p-4 pl-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${s.badge}`}>
                {s.label}
              </span>
              <Badge tone={SEV_TONE[f.severity]}>{f.severity}</Badge>
            </div>
            <code className="truncate text-xs text-white/50">{f.surface}</code>
          </div>
          <p className="mt-2.5 text-sm text-white/90">{f.finding}</p>
          {f.repro ? (
            <p className="mt-1.5 text-xs text-white/55">
              <span className="text-white/70">Repro:</span> {f.repro}
            </p>
          ) : null}
          {f.note ? <p className="mt-1.5 text-xs italic text-white/55">{f.note}</p> : null}
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-white/45">
            {f.owner ? (
              <span className="rounded bg-white/8 px-1.5 py-0.5 text-white/55">
                {OWNER_LABEL[f.owner] ?? f.owner}
              </span>
            ) : null}
            {f.commit_sha ? <code className="text-white/55">{f.commit_sha.slice(0, 7)}</code> : null}
            <span className="ml-auto">{ago(f.updated_at)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function QaBoardPage() {
  const { realRole } = useRole();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/qa/findings");
      const d = await r.json().catch(() => ({}));
      setFindings(Array.isArray(d.findings) ? d.findings : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }

  const open = findings.filter((f) => f.status === "new" || f.status === "reopened").length;
  const awaiting = findings.filter((f) => f.status === "fixed").length;
  const verified = findings.filter((f) => f.status === "verified").length;

  return (
    <div>
      <PageHead
        title="QA board"
        sub="Grok Bot files findings, Claude fixes them and marks the commit, Grok Bot verifies. The live loop."
      />

      {!loading && findings.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span>{open} open</span>
          <span className="text-white/25">·</span>
          <span>{awaiting} awaiting verify</span>
          <span className="text-white/25">·</span>
          <span>{verified} done</span>
        </div>
      ) : null}

      {loading ? (
        <p className="py-16 text-center text-sm text-white/55">Loading…</p>
      ) : findings.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-white/55">
            No findings yet. When Grok Bot runs a sweep, they land here as they&apos;re filed.
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {COLUMNS.map((col) => {
            const items = findings.filter((f) => f.status === col.key);
            if (!items.length) return null;
            return (
              <div key={col.key}>
                <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${COL_ACCENT[col.key]}`}>
                  {col.title} · {items.length}
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((f) => (
                    <FindingCard key={f.id} f={f} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
