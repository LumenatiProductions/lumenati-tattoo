"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchToday,
  checkIn,
  startDeposit,
  getKioskToken,
  setKioskToken,
  type KioskBooking,
} from "@/lib/kiosk/api";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

type Screen = "loading" | "setup" | "notconfigured" | "list" | "detail" | "done";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [bookings, setBookings] = useState<KioskBooking[]>([]);
  const [stripeOn, setStripeOn] = useState(false);
  const [selected, setSelected] = useState<KioskBooking | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchToday();
    if (!res.ok) {
      if (res.status === 503) setScreen("notconfigured");
      else setScreen("setup"); // 401 / bad-or-missing token -> re-provision
      return;
    }
    setBookings(res.bookings);
    setStripeOn(res.stripe);
    setScreen("list");
  }, []);

  useEffect(() => {
    if (!getKioskToken()) setScreen("setup");
    else load();
  }, [load]);

  // Auto-reset to the list a short while after a completed check-in.
  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => {
      setSelected(null);
      load();
      setScreen("list");
    }, 30_000);
    return () => clearTimeout(t);
  }, [screen, load]);

  if (screen === "loading") {
    return <Center>Loading…</Center>;
  }

  if (screen === "notconfigured") {
    return (
      <Center>
        <div className="text-center">
          <Logo className="mx-auto" />
          <p className="mt-4 max-w-sm text-sm text-white/55">
            This kiosk isn&apos;t set up yet. Add <code className="text-brand">KIOSK_DEVICE_TOKEN</code> to
            the server, then provision this iPad.
          </p>
        </div>
      </Center>
    );
  }

  if (screen === "setup") {
    return <Setup onSaved={load} initialError={err} setErr={setErr} />;
  }

  if (screen === "detail" && selected) {
    return (
      <CheckIn
        booking={selected}
        onCancel={() => {
          setSelected(null);
          setScreen("list");
        }}
        onDone={(updated) => {
          setSelected(updated);
          setScreen("done");
        }}
      />
    );
  }

  if (screen === "done" && selected) {
    return (
      <Done
        booking={selected}
        stripeOn={stripeOn}
        onFinish={() => {
          setSelected(null);
          load();
          setScreen("list");
        }}
      />
    );
  }

  // list
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="relative mb-6">
        <Logo className="mx-auto" />
        <button
          onClick={load}
          className="absolute right-0 top-0 text-xs text-white/40 hover:text-white/70"
        >
          Refresh
        </button>
      </div>
      <h1 className="mb-1 text-center text-2xl font-bold">Welcome — tap your appointment</h1>
      <p className="mb-6 text-center text-sm text-white/50">Today&apos;s sessions</p>

      {bookings.length === 0 ? (
        <Card className="py-12 text-center text-white/45">No appointments scheduled today.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setSelected(b);
                setScreen("detail");
              }}
              className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-4 text-left transition hover:bg-white/10 active:scale-[0.99]"
            >
              <div>
                <div className="text-lg font-semibold">
                  {b.firstName || "Guest"} {b.lastName}
                </div>
                <div className="text-sm text-white/50">
                  {clock(b.startsAt)}
                  {b.artistName ? ` · ${b.artistName}` : ""}
                  {b.serviceDesc ? ` · ${b.serviceDesc}` : ""}
                </div>
              </div>
              {b.checkedIn ? (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
                  Checked in
                </span>
              ) : (
                <span className="text-2xl text-white/30">›</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckIn({
  booking,
  onCancel,
  onDone,
}: {
  booking: KioskBooking;
  onCancel: () => void;
  onDone: (updated: KioskBooking) => void;
}) {
  const [firstName, setFirstName] = useState(booking.firstName);
  const [lastName, setLastName] = useState(booking.lastName);
  const [phone, setPhone] = useState(booking.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await checkIn(booking.id, { firstName, lastName, phone });
    setBusy(false);
    if (res.ok) onDone({ ...booking, firstName, lastName, phone, checkedIn: true });
    else setError(res.error || "Could not check in.");
  };

  const field =
    "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg text-white placeholder-white/30 outline-none focus:border-brand";

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <button onClick={onCancel} className="mb-6 text-sm text-white/40 hover:text-white/70">
        ‹ Back
      </button>
      <h1 className="mb-1 text-2xl font-bold">Confirm your details</h1>
      <p className="mb-6 text-sm text-white/50">
        {clock(booking.startsAt)}
        {booking.artistName ? ` · ${booking.artistName}` : ""}
      </p>

      <div className="flex flex-col gap-3">
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={field} />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={field} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" inputMode="tel" className={field} />
      </div>

      {error && <div className="mt-4 text-sm text-rose-400">{error}</div>}

      <button
        onClick={submit}
        disabled={busy || !firstName.trim()}
        className="mt-6 w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Checking in…" : "I'm here — check in"}
      </button>
    </div>
  );
}

function Done({
  booking,
  stripeOn,
  onFinish,
}: {
  booking: KioskBooking;
  stripeOn: boolean;
  onFinish: () => void;
}) {
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositErr, setDepositErr] = useState<string | null>(null);

  const depositDue =
    booking.depositCents >= 50 && booking.depositStatus === "none";
  const consentUnsigned = booking.consent.state === "unsigned" && booking.consent.token;

  const payDeposit = async () => {
    setDepositBusy(true);
    setDepositErr(null);
    const res = await startDeposit(booking.id);
    if (res.ok && res.url) {
      window.location.href = res.url; // /pay/<token> on this iPad
      return;
    }
    setDepositBusy(false);
    setDepositErr(res.error || "Could not start payment.");
  };

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-300">
          ✓
        </div>
        <h1 className="text-2xl font-bold">You&apos;re checked in</h1>
        <p className="mt-1 text-sm text-white/50">
          {booking.firstName} — have a seat, {booking.artistName || "your artist"} will be with you shortly.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {/* Consent */}
        {booking.consent.state === "signed" ? (
          <Row label="Consent form" value="Signed" tone="good" />
        ) : consentUnsigned ? (
          <a
            href={`/intake/${booking.consent.token}`}
            className="rounded-xl bg-white/5 px-5 py-4 text-center text-base font-semibold text-white hover:bg-white/10"
          >
            Sign your consent form →
          </a>
        ) : (
          <Row label="Consent form" value="The desk will set this up" tone="muted" />
        )}

        {/* Deposit */}
        {depositDue &&
          (stripeOn ? (
            <button
              onClick={payDeposit}
              disabled={depositBusy}
              className="rounded-xl bg-brand px-5 py-4 text-base font-semibold text-white disabled:opacity-40"
            >
              {depositBusy ? "Opening…" : `Pay deposit ${usd(booking.depositCents)}`}
            </button>
          ) : (
            <Row label={`Deposit ${usd(booking.depositCents)}`} value="Pay at the desk" tone="muted" />
          ))}
        {depositErr && <div className="text-center text-sm text-rose-400">{depositErr}</div>}
      </div>

      <button onClick={onFinish} className="mt-10 w-full text-sm text-white/40 hover:text-white/70">
        Done
      </button>
    </div>
  );
}

function Setup({
  onSaved,
  initialError,
  setErr,
}: {
  onSaved: () => void;
  initialError: string | null;
  setErr: (s: string | null) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <Center>
      <div className="w-full max-w-xs text-center">
        <Logo className="mx-auto" />
        <p className="mt-4 mb-5 text-sm text-white/50">Enter the device code to set up this kiosk.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Device code"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-lg text-white placeholder-white/30 outline-none focus:border-brand"
        />
        {initialError && <div className="mt-3 text-sm text-rose-400">{initialError}</div>}
        <button
          onClick={() => {
            if (!code.trim()) return;
            setKioskToken(code);
            setErr(null);
            onSaved();
          }}
          className="mt-4 w-full rounded-xl bg-brand py-3 text-base font-semibold text-white"
        >
          Set up kiosk
        </button>
      </div>
    </Center>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "good" | "muted" }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 px-5 py-4">
      <span className="text-base text-white/80">{label}</span>
      <span className={tone === "good" ? "text-sm font-medium text-emerald-300" : "text-sm text-white/40"}>
        {value}
      </span>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-6">{children}</div>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white/5 px-5 ${className}`}>{children}</div>;
}

function Logo({ className = "" }: { className?: string }) {
  // Tailwind preflight makes <img> display:block, so text-center won't center it
  // — pass `mx-auto` on the screens where the logo is a centered brand moment.
  return <LumenatiLogo bg="dark" className={`w-32 ${className}`} />;
}
