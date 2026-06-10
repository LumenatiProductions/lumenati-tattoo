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

type Screen = "loading" | "setup" | "notconfigured" | "welcome" | "list" | "detail" | "done";

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

  // Pull today's bookings. Returns whether the kiosk is provisioned (ok); the
  // screen to land on is the caller's call, so the same fetch backs the initial
  // boot, the welcome "Sync", and the post-check-in reset.
  const load = useCallback(async (): Promise<boolean> => {
    const res = await fetchToday();
    if (!res.ok) {
      if (res.status === 503) setScreen("notconfigured");
      else setScreen("setup"); // 401 / bad-or-missing token -> re-provision
      return false;
    }
    setBookings(res.bookings);
    setStripeOn(res.stripe);
    return true;
  }, []);

  useEffect(() => {
    if (!getKioskToken()) setScreen("setup");
    else load().then((ok) => ok && setScreen("welcome"));
  }, [load]);

  // Auto-reset to the welcome/attract screen a while after a completed check-in.
  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => {
      setSelected(null);
      load();
      setScreen("welcome");
    }, 30_000);
    return () => clearTimeout(t);
  }, [screen, load]);

  if (screen === "loading") {
    return (
      <Center>
        <div className="flex flex-col items-center gap-5">
          <div className="spinner" />
          <p className="f-pixel text-xs uppercase tracking-[0.3em] text-pink-300/80">
            Loading<span className="blink">_</span>
          </p>
        </div>
      </Center>
    );
  }

  if (screen === "notconfigured") {
    return (
      <Center>
        <div className="flex flex-col items-center text-center">
          <Logo />
          <p className="f-pixel mt-6 max-w-sm text-[10px] leading-relaxed text-white/55">
            THIS KIOSK ISN&apos;T SET UP YET.
          </p>
          <p className="f-vt mt-3 max-w-sm text-xl text-white/55">
            Add <code className="glow-lime">KIOSK_DEVICE_TOKEN</code> to the server, then provision this iPad.
          </p>
        </div>
      </Center>
    );
  }

  if (screen === "setup") {
    // On success, land on the welcome screen — load() alone only fetches.
    return (
      <Setup
        onSaved={() => {
          load().then((ok) => ok && setScreen("welcome"));
        }}
        initialError={err}
        setErr={setErr}
      />
    );
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
          setScreen("welcome");
        }}
      />
    );
  }

  if (screen === "welcome") {
    return (
      <Welcome
        onBegin={() => {
          load();
          setScreen("list");
        }}
      />
    );
  }

  // list
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <div className="relative mb-5 flex flex-col items-center text-center">
        <button
          onClick={() => setScreen("welcome")}
          className="f-mono absolute left-0 top-0 text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
        >
          ‹ Home
        </button>
        <button
          onClick={load}
          className="f-mono absolute right-0 top-0 text-[11px] uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200"
        >
          ⟳ Sync
        </button>
        <Logo className="mx-auto" />
        <h1 className="f-pixel neon-text mt-4 text-2xl">TAP YOUR NAME</h1>
        <p className="f-vt glow-cyan mt-2 text-2xl">today&apos;s sessions</p>
      </div>

      {bookings.length === 0 ? (
        <div className="y2k-card px-6 py-12 text-center">
          <p className="f-pixel text-xs text-white/60">NO SESSIONS TODAY</p>
          <p className="f-vt mt-3 text-2xl text-white/45">the shop is quiet ✦ go make some art</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((b, i) => (
            <button
              key={b.id}
              onClick={() => {
                setSelected(b);
                setScreen("detail");
              }}
              style={{ animationDelay: `${i * 70}ms` }}
              className="y2k-card rise flex items-center justify-between px-5 py-4 text-left"
            >
              <div className="min-w-0">
                <div className="f-vt glow-pink truncate text-3xl leading-none">
                  {b.firstName || "Guest"} {b.lastName}
                </div>
                <div className="f-mono mt-1.5 truncate text-[11px] uppercase tracking-wider text-white/50">
                  {clock(b.startsAt)}
                  {b.artistName ? ` · ${b.artistName}` : ""}
                  {b.serviceDesc ? ` · ${b.serviceDesc}` : ""}
                </div>
              </div>
              {b.checkedIn ? (
                <span className="f-pixel glow-lime ml-3 shrink-0 text-[9px]">✓ IN</span>
              ) : (
                <span className="f-pixel glow-lime blink ml-3 shrink-0 text-lg">▶</span>
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

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6">
      <button
        onClick={onCancel}
        className="f-mono mb-6 text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
      >
        ‹ Back
      </button>
      <h1 className="f-pixel glow-pink text-lg">CONFIRM YOUR DETAILS</h1>
      <p className="f-mono mt-2 text-[11px] uppercase tracking-wider text-cyan-300/60">
        {clock(booking.startsAt)}
        {booking.artistName ? ` · ${booking.artistName}` : ""}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <Field label="First name" value={firstName} onChange={setFirstName} placeholder="JANE" />
        <Field label="Last name" value={lastName} onChange={setLastName} placeholder="DOE" />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="555 0123" inputMode="tel" />
      </div>

      {error && <div className="f-vt mt-4 text-xl text-rose-400">{error}</div>}

      <button onClick={submit} disabled={busy || !firstName.trim()} className="gel mt-7 w-full">
        {busy ? "CHECKING IN…" : "I'M HERE ▸ CHECK IN"}
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

  const depositDue = booking.depositCents >= 50 && booking.depositStatus === "none";
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
    <div className="mx-auto w-full max-w-md px-5 py-8">
      <div className="flex flex-col items-center text-center">
        <div
          className="eye-glow mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2"
          style={{ borderColor: "rgba(127,255,0,0.5)", background: "rgba(127,255,0,0.08)" }}
        >
          <span className="f-pixel glow-lime text-xl">✓</span>
        </div>
        <h1 className="f-pixel neon-text text-2xl">YOU&apos;RE IN</h1>
        <p className="f-vt mt-3 text-2xl leading-snug text-white/65">
          {booking.firstName}, grab a seat ✦ {booking.artistName || "your artist"} will be with you shortly.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {/* Consent */}
        {booking.consent.state === "signed" ? (
          <Row label="Consent form" value="Signed" tone="good" />
        ) : consentUnsigned ? (
          <a href={`/intake/${booking.consent.token}`} className="gel gel-lime block text-center">
            SIGN YOUR CONSENT FORM ▸
          </a>
        ) : (
          <Row label="Consent form" value="The desk will set this up" tone="muted" />
        )}

        {/* Deposit */}
        {depositDue &&
          (stripeOn ? (
            <button onClick={payDeposit} disabled={depositBusy} className="gel w-full">
              {depositBusy ? "OPENING…" : `PAY DEPOSIT ${usd(booking.depositCents)}`}
            </button>
          ) : (
            <Row label={`Deposit ${usd(booking.depositCents)}`} value="Pay at the desk" tone="muted" />
          ))}
        {depositErr && <div className="f-vt text-center text-xl text-rose-400">{depositErr}</div>}
      </div>

      <button
        onClick={onFinish}
        className="f-mono mt-10 w-full text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white/70"
      >
        Done ✦ back to start
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
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Logo />
        <p className="f-pixel mt-6 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">
          Enter the device code
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="DEVICE CODE"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          className="term mt-4 text-center"
        />
        {initialError && <div className="f-vt mt-3 text-xl text-rose-400">{initialError}</div>}
        <button
          onClick={() => {
            if (!code.trim()) return;
            setKioskToken(code);
            setErr(null);
            onSaved();
          }}
          className="gel mt-5 w-full"
        >
          SET UP KIOSK ▸
        </button>
      </div>
    </Center>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "tel";
}) {
  return (
    <label className="block">
      <span className="f-mono mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-lime-300/60">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="term"
      />
    </label>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "good" | "muted" }) {
  return (
    <div className="y2k-card flex items-center justify-between px-5 py-4">
      <span className="f-vt text-2xl text-white/85">{label}</span>
      <span
        className={
          tone === "good"
            ? "f-mono glow-lime text-[11px] uppercase tracking-wider"
            : "f-mono text-[11px] uppercase tracking-wider text-white/40"
        }
      >
        {value}
      </span>
    </div>
  );
}

function Welcome({ onBegin }: { onBegin: () => void }) {
  // The customer-facing attract screen — the idle state a walk-up sees (the
  // device-code screen is staff-only and never shown once provisioned). The whole
  // screen is the tap target. Live clock for a little retro arcade life.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <button onClick={onBegin} className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <div className="f-mono mb-7 h-4 text-[12px] uppercase tracking-[0.3em] text-cyan-300/60">
        {now
          ? `${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
          : ""}
      </div>
      <LumenatiLogo bg="dark" className="eye-glow w-44" />
      <h1 className="f-pixel neon-text mt-7 text-4xl">WELCOME</h1>
      <p className="f-vt glow-pink mt-3 text-3xl">lumenati tattoo // denver</p>
      <p className="f-pixel blink mt-12 text-xs uppercase tracking-[0.3em] text-lime-300/80">
        ▸ Tap anywhere to check in ◂
      </p>
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-6 py-8">{children}</div>;
}

function Logo({ className = "" }: { className?: string }) {
  // The all-seeing eye is peak Y2K/illuminati — keep it as the glowing hero.
  return <LumenatiLogo bg="dark" className={`eye-glow w-28 ${className}`} />;
}
