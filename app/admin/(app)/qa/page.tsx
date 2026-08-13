"use client";

import { useRole } from "@/lib/admin/role-context";
import { PageHead } from "@/components/admin/home/shared";
import { Card, Badge } from "@/components/admin/ui";
import findingsData from "@/qa/findings.json";

// The Grok Bot <-> Claude QA board. Source of truth is qa/findings.json in the
// repo (the bridge until a write API exists): Grok files findings as `new`,
// Claude fixes each and sets `fixed` + commit_sha, Grok verifies or reopens.
// This page renders that committed file, newest work on top. Owner-only.
// See qa/README.md for the loop.

type Severity = "P0" | "P1" | "P2" | "P3";
type Status = "new" | "fixed" | "verified" | "reopened" | "wontfix";
type Owner = "grokbot" | "claude" | "scott";

type Finding = {
  ext_id: string;
  surface: string;
  severity: Severity;
  finding: string;
  repro: string;
  owner: Owner;
  status: Status;
  commit_sha?: string;
  note?: string;
};

const findings = findingsData as Finding[];

// New work floats up; settled rows sink. Ties break on severity (P0 first).
const STATUS_RANK: Record<Status, number> = { new: 0, reopened: 1, fixed: 2, verified: 3, wontfix: 4 };
const SEV_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  fixed: "Fixed",
  verified: "Verified",
  reopened: "Reopened",
  wontfix: "Won't fix",
};
const STATUS_TONE: Record<Status, "neutral" | "good" | "warn" | "bad"> = {
  new: "warn",
  fixed: "neutral",
  verified: "good",
  reopened: "bad",
  wontfix: "neutral",
};
const SEV_TONE: Record<Severity, "neutral" | "warn" | "bad"> = {
  P0: "bad",
  P1: "warn",
  P2: "neutral",
  P3: "neutral",
};
const OWNER_LABEL: Record<Owner, string> = { grokbot: "Grok Bot", claude: "Claude", scott: "Scott" };

export default function QaBoardPage() {
  const { realRole } = useRole();
  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }

  const rows = [...findings].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      SEV_RANK[a.severity] - SEV_RANK[b.severity],
  );
  const open = findings.filter((f) => f.status === "new" || f.status === "reopened").length;
  const awaiting = findings.filter((f) => f.status === "fixed").length;

  return (
    <div>
      <PageHead
        title="QA board"
        sub="The Grok Bot and Claude loop. New findings up top; fixes wait here for a re-check."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-white/60">
        <span>{open} open</span>
        <span className="text-white/25">·</span>
        <span>{awaiting} awaiting verify</span>
        <span className="text-white/25">·</span>
        <span>{findings.length} total</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-sm text-white/55">Board is clear.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <Card key={f.ext_id}>
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEV_TONE[f.severity]}>{f.severity}</Badge>
                  <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                  <code className="rounded bg-white/6 px-1.5 py-0.5 text-xs text-white/75">{f.surface}</code>
                  <span className="ml-auto text-xs text-white/45">
                    {f.ext_id} · {OWNER_LABEL[f.owner]}
                  </span>
                </div>
                <p className="mt-2.5 text-sm text-white/90">{f.finding}</p>
                <p className="mt-1.5 text-xs text-white/55">
                  <span className="font-medium text-white/70">Repro:</span> {f.repro}
                </p>
                {f.commit_sha ? (
                  <p className="mt-1.5 text-xs text-white/55">
                    <span className="font-medium text-white/70">Fix:</span>{" "}
                    <code className="rounded bg-white/6 px-1.5 py-0.5 text-white/75">
                      {f.commit_sha.slice(0, 10)}
                    </code>
                  </p>
                ) : null}
                {f.note ? (
                  <p className="mt-1.5 text-xs text-white/55">
                    <span className="font-medium text-white/70">Note:</span> {f.note}
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
