import type { ReactNode } from "react";

// The lead line of a Money tab: what this tab is, plus its controls on the
// right. No h1 — the page's one title is "Money"; the tab strip names the tab.
export function TabHeader({
  subtitle,
  sub,
  action,
}: {
  title?: string;
  subtitle?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  const lead = subtitle ?? sub;
  if (!lead && !action) return null;
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      {lead ? <p className="max-w-3xl text-sm text-white/65">{lead}</p> : <span />}
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
