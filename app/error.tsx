"use client";

import { useEffect } from "react";

// Route-level error boundary: friendly, on-brand, and it phones home (the
// report API forwards to ALERT_WEBHOOK_URL when configured).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        where: typeof window !== "undefined" ? window.location.pathname : "unknown",
        message: `${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-black/8 bg-white p-8 text-center shadow-sm">
        <div className="text-2xl font-extrabold tracking-tight">
          LUMENATI<span className="text-[#FF1493]">.</span>
        </div>
        <h1 className="mt-4 text-lg font-bold text-zinc-900">Something broke.</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Not your fault — the shop has been notified. Try again, or come back in a minute.
        </p>
        <button
          onClick={reset}
          className="mt-5 w-full rounded-xl bg-[#FF1493] py-3 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
