"use client";

// Last-resort boundary (covers errors in the root layout itself). Must render
// its own <html>/<body> per Next.js rules; keep it dependency-free.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#f4f4f5" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 360, width: "100%", background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
              LUMENATI<span style={{ color: "#FF1493" }}>.</span>
            </div>
            <h1 style={{ fontSize: 17, margin: "16px 0 4px", color: "#18181b" }}>Something broke.</h1>
            <p style={{ fontSize: 14, color: "#71717a", margin: 0 }}>
              Try again, or come back in a minute.{error.digest ? ` (Ref ${error.digest})` : ""}
            </p>
            <button
              onClick={reset}
              style={{ marginTop: 20, width: "100%", background: "#FF1493", color: "#fff", border: 0, borderRadius: 12, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
