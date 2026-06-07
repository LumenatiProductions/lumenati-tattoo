"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AFTERCARE_STATEMENTS,
  CONSENT_STATEMENTS,
  MEDICAL_QUESTIONS,
  SIGNATURE_VIEWBOX,
} from "@/lib/intake/forms";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// Public, token-gated consent signer. Lives OUTSIDE the (site) route group, so
// it does not load the legacy Winamp/Clippy bundle — this is a legal form, not
// the Y2K front-of-house experience. No Supabase session: it talks only to the
// token-gated /api/intake/sign endpoints.

type Status = "loading" | "ready" | "signed" | "void" | "invalid" | "error";
type Ctx = {
  clientFirstName: string | null;
  artistName: string | null;
  bookingStartsAt: string | null;
  placement: string | null;
};

export default function SignPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [ctx, setCtx] = useState<Ctx | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/intake/sign?token=${encodeURIComponent(token)}`);
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok && r.status >= 500) {
          setStatus("error");
          return;
        }
        setStatus((d.status as Status) ?? "invalid");
        setCtx(d.context ?? null);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-xl">
          <LumenatiLogo bg="dark" className="w-28" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-zinc-400">Consent &amp; aftercare</div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-6">
        {status === "loading" && <Centered>Loading your form…</Centered>}
        {status === "error" && <Centered>Something went wrong loading this form. Please refresh or see the front desk.</Centered>}
        {status === "invalid" && <Centered>This signing link isn’t valid. Please ask the front desk for a new one.</Centered>}
        {status === "void" && <Centered>This form has been voided. Please see the front desk.</Centered>}
        {status === "signed" && (
          <Centered>
            <div className="text-lg font-semibold text-emerald-700">All signed — thank you.</div>
            <p className="mt-1 text-sm text-zinc-500">Your consent form is on file. We’ll verify your ID in person when you arrive.</p>
          </Centered>
        )}
        {status === "ready" && (
          <SignForm token={token} ctx={ctx} onSigned={() => setStatus("signed")} />
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/8 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
      {children}
    </div>
  );
}

function SignForm({ token, ctx, onSigned }: { token: string; ctx: Ctx | null; onSigned: () => void }) {
  const [signedName, setSignedName] = useState("");
  const [dob, setDob] = useState("");
  const [placement, setPlacement] = useState(ctx?.placement ?? "");
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<boolean[]>(CONSENT_STATEMENTS.map(() => false));
  const [aftercare, setAftercare] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setMed = (key: string, val: string) => setMedical((s) => ({ ...s, [key]: val }));

  const allConsented = consent.every(Boolean);
  const ready = signedName.trim() && dob && allConsented && aftercare && signature;

  const submit = async () => {
    setErr(null);
    if (!signedName.trim()) return setErr("Please type your full legal name.");
    if (!dob) return setErr("Please enter your date of birth.");
    if (!allConsented) return setErr("Please confirm every consent statement.");
    if (!aftercare) return setErr("Please acknowledge the aftercare instructions.");
    if (!signature) return setErr("Please draw your signature.");

    const answers: Record<string, unknown> = { consent };
    for (const q of MEDICAL_QUESTIONS) {
      answers[q.key] = medical[q.key] ?? "no";
      const detail = medical[`${q.key}_detail`];
      if (detail) answers[`${q.key}_detail`] = detail;
    }

    setBusy(true);
    const r = await fetch("/api/intake/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        signedName: signedName.trim(),
        dob,
        placement: placement.trim() || undefined,
        signatureSvg: signature,
        answers,
        aftercareAck: aftercare,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Could not submit. Please try again.");
    onSigned();
  };

  const card = "rounded-2xl border border-black/8 bg-white p-5 shadow-sm";
  const input = "w-full rounded-lg border border-black/12 bg-white px-3 py-2.5 text-sm";

  return (
    <div className="space-y-4">
      {/* PLACEHOLDER legal-text notice — shows while the copy in lib/intake/forms.ts is filler. */}
      <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Demo wording. The consent, medical, and aftercare text below is placeholder copy and not legally binding until the shop’s real language is added.
      </div>

      <div className={card}>
        <h1 className="text-lg font-bold">
          {ctx?.clientFirstName ? `Hi ${ctx.clientFirstName} — ` : ""}let’s get you ready.
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {[ctx?.artistName ? `With ${ctx.artistName}` : null, fmtAppt(ctx?.bookingStartsAt)].filter(Boolean).join(" · ") ||
            "Please complete and sign before your appointment."}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full legal name">
            <input className={input} value={signedName} onChange={(e) => setSignedName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Date of birth">
            <input className={input} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label="Tattoo placement (body area)">
            <input className={input} value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder="Left forearm…" />
          </Field>
        </div>
      </div>

      {/* Medical questionnaire */}
      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">Health questions</h2>
        <div className="mt-3 space-y-3">
          {MEDICAL_QUESTIONS.map((q) => {
            const val = medical[q.key] ?? "no";
            return (
              <div key={q.key}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-zinc-700">{q.label.replace(/^PLACEHOLDER —\s*/, "")}</span>
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-black/12">
                    {(["no", "yes"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setMed(q.key, opt)}
                        className={`px-3 py-1.5 text-xs font-semibold ${
                          val === opt ? (opt === "yes" ? "bg-amber-500 text-white" : "bg-zinc-800 text-white") : "bg-white text-zinc-500"
                        }`}
                      >
                        {opt === "yes" ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
                {val === "yes" && (
                  <input
                    className={`${input} mt-2`}
                    value={medical[`${q.key}_detail`] ?? ""}
                    onChange={(e) => setMed(`${q.key}_detail`, e.target.value)}
                    placeholder="Add detail (optional)"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Consent */}
      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">Consent</h2>
        <div className="mt-3 space-y-2.5">
          {CONSENT_STATEMENTS.map((statement, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={consent[i]}
                onChange={(e) => setConsent((s) => s.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="text-sm text-zinc-700">{statement.replace(/^PLACEHOLDER —\s*/, "")}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Aftercare */}
      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">Aftercare</h2>
        <ul className="mt-3 space-y-1.5">
          {AFTERCARE_STATEMENTS.map((statement, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {statement.replace(/^PLACEHOLDER —\s*/, "")}
            </li>
          ))}
        </ul>
        <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-black/8 pt-3">
          <input type="checkbox" checked={aftercare} onChange={(e) => setAftercare(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
          <span className="text-sm font-medium text-zinc-700">I have read and understand the aftercare instructions.</span>
        </label>
      </div>

      {/* Signature */}
      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">Signature</h2>
        <p className="mt-1 text-xs text-zinc-400">Draw your signature in the box below.</p>
        <SignaturePad value={signature} onChange={setSignature} />
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !ready}
        className="w-full rounded-xl bg-brand px-4 py-3.5 text-base font-bold text-white shadow-sm disabled:opacity-40"
      >
        {busy ? "Submitting…" : "Sign & submit"}
      </button>
      <p className="pb-8 text-center text-xs text-zinc-400">
        By submitting you confirm the information above is accurate. Your ID is verified in person at the shop.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-black/45">{label}</span>
      {children}
    </label>
  );
}

// Self-contained draw-to-sign pad. Records strokes in the fixed SIGNATURE_VIEWBOX
// coordinate space and emits SVG *path data* (the `d` string) — never markup —
// so it stores and renders safely.
function SignaturePad({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Finished strokes, and the one currently being drawn (rendered, not yet emitted).
  const [committed, setCommitted] = useState<string[]>([]);
  const [live, setLive] = useState<string>("");
  const drawing = useRef(false);

  const toView = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * SIGNATURE_VIEWBOX.w;
    const y = ((clientY - r.top) / r.height) * SIGNATURE_VIEWBOX.h;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }, []);

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = toView(e.clientX, e.clientY);
    setLive(`M${x} ${y}`);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const { x, y } = toView(e.clientX, e.clientY);
    setLive((d) => `${d} L${x} ${y}`);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!live) return;
    const next = [...committed, live];
    setCommitted(next);
    setLive("");
    onChange(next.join(" "));
  };

  const clear = () => {
    setCommitted([]);
    setLive("");
    onChange("");
  };

  const paths = live ? [...committed, live] : committed;

  return (
    <div className="mt-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIGNATURE_VIEWBOX.w} ${SIGNATURE_VIEWBOX.h}`}
        className="h-44 w-full touch-none rounded-lg border border-black/15 bg-[repeating-linear-gradient(0deg,transparent,transparent_43px,rgba(0,0,0,0.05)_44px)]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        role="application"
        aria-label="Signature pad"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#0e0e11" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">{value ? "Looks good." : "Sign above with finger, stylus, or mouse."}</span>
        <button type="button" onClick={clear} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
          Clear
        </button>
      </div>
    </div>
  );
}

function fmtAppt(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
