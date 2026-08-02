"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/admin/NavIcon";

// "Report a bug" for the admin. Tapping it grabs a screenshot of the current
// screen (best-effort — a capture failure still sends the note), then opens a
// small sheet for a one-line description. Posts to /api/bugs, which stores it
// and pings Slack. Mirrors the app's reporter so both feel the same.
//
// variant="rail" renders the trigger as a sidebar item (icon + tiny label) so it
// lives in the nav instead of floating over the page; "float" is the legacy pill.

type Phase = "idle" | "capturing" | "sheet" | "sending" | "done" | "error";

export default function BugReporter({ variant = "float" }: { variant?: "float" | "rail" }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (phase === "sheet") textRef.current?.focus();
  }, [phase]);

  const open = useCallback(async () => {
    setNote("");
    setErrMsg(null);
    setShot(null);
    setPhase("capturing");
    let captured: string | null = null;
    try {
      // Import on demand so the (heavy-ish) capture lib never ships in the
      // first paint of the dashboard.
      const { domToJpeg } = await import("modern-screenshot");
      captured = await domToJpeg(document.body, {
        quality: 0.7,
        scale: 1, // 1x keeps the base64 well under Vercel's request limit
        backgroundColor: "#0b0b10",
        filter: (n: Node) =>
          !(n instanceof HTMLElement && n.dataset && n.dataset.bugReporter === "1"),
      });
    } catch {
      captured = null; // capture failed — the note alone is still useful
    }
    setShot(captured);
    setPhase("sheet");
  }, []);

  const send = useCallback(async () => {
    if (note.trim().length < 2) {
      setErrMsg("Add a quick note about what went wrong.");
      return;
    }
    setPhase("sending");
    setErrMsg(null);
    try {
      const r = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim(),
          url: pathname,
          surface: "web",
          screenshot: shot,
          userAgent: navigator.userAgent,
          meta: { path: pathname },
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErrMsg(d.error || "Could not send — try again.");
        setPhase("sheet");
        return;
      }
      setPhase("done");
      setTimeout(() => setPhase("idle"), 2200);
    } catch {
      setErrMsg("Connection problem — try again.");
      setPhase("sheet");
    }
  }, [note, pathname, shot]);

  const close = () => {
    setPhase("idle");
    setNote("");
    setShot(null);
    setErrMsg(null);
  };

  const pill = {
    position: "fixed" as const,
    right: 18,
    bottom: 18,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(20,20,26,0.92)",
    color: "#e7e7ea",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
  };

  // Sidebar trigger: matches the slim-rail buttons (icon + tiny uppercase label).
  if (variant === "rail") {
    if (phase === "sheet" || phase === "sending") {
      // fall through to the shared sheet below
    } else {
      const done = phase === "done";
      return (
        <button
          data-bug-reporter="1"
          onClick={open}
          disabled={phase === "capturing"}
          title="Report a bug"
          className={`flex w-full flex-col items-center gap-1 rounded-lg py-2 ${
            done ? "text-emerald-400" : "text-white/65 hover:bg-white/6"
          }`}
        >
          <NavIcon name="bug" className="h-[18px] w-[18px]" />
          <span className="px-0.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide">
            {phase === "capturing" ? "Wait…" : done ? "Sent" : "Report bug"}
          </span>
        </button>
      );
    }
  } else {
    if (phase === "done") {
      return (
        <div data-bug-reporter="1" style={{ ...pill, cursor: "default", color: "#34d399" }}>
          Thanks — sent.
        </div>
      );
    }
    if (phase === "idle" || phase === "capturing") {
      return (
        <button data-bug-reporter="1" style={pill} onClick={open} disabled={phase === "capturing"}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>◎</span>
          {phase === "capturing" ? "Grabbing screen…" : "Report a bug"}
        </button>
      );
    }
  }

  // sheet / sending
  return (
    <div
      data-bug-reporter="1"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: 18,
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          maxWidth: "100%",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#15151b",
          color: "#e7e7ea",
          padding: 16,
          boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Report a bug</div>
          <button onClick={close} style={{ background: "none", border: "none", color: "#9a9aa2", cursor: "pointer", fontSize: 18 }}>
            ×
          </button>
        </div>

        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot}
            alt="screenshot"
            style={{ width: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}
          />
        ) : (
          <div style={{ fontSize: 12, color: "#9a9aa2", marginBottom: 10 }}>
            Couldn&apos;t grab a screenshot this time — your note still comes through.
          </div>
        )}

        <textarea
          ref={textRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What went wrong? What were you trying to do?"
          rows={3}
          style={{
            width: "100%",
            resize: "none",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "#0e0e13",
            color: "#e7e7ea",
            padding: "9px 11px",
            fontSize: 13,
            outline: "none",
          }}
        />

        {errMsg ? <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{errMsg}</div> : null}

        <button
          onClick={send}
          disabled={phase === "sending"}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 0",
            borderRadius: 10,
            border: "none",
            background: "#ff1493",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: phase === "sending" ? "default" : "pointer",
            opacity: phase === "sending" ? 0.7 : 1,
          }}
        >
          {phase === "sending" ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}
