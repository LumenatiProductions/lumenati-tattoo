"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// A quiet nudge on the overview when something operational needs attention —
// a failed send, a dispute, an app error. Hidden when all clear. The full list
// lives on the Health page; this is just the "go look" signal.
export default function HealthBanner() {
  const [unresolved, setUnresolved] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setUnresolved(Number(d?.unresolved) || 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (unresolved <= 0) return null;

  return (
    <Link
      href="/admin/health"
      className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 hover:bg-amber-400/15"
    >
      <span className="text-sm text-white/85">
        {unresolved} thing{unresolved === 1 ? "" : "s"} need{unresolved === 1 ? "s" : ""} a look on Health.
      </span>
      <span className="text-xs font-semibold text-amber-300">Open Health →</span>
    </Link>
  );
}
