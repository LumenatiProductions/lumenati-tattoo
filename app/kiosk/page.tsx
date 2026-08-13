"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
          <p className="f-pixel text-xs uppercase tracking-[0.3em] text-pink-200/95">
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
          <p className="f-pixel mt-6 max-w-sm text-[10px] leading-relaxed text-white/80">
            THIS KIOSK ISN&apos;T SET UP YET.
          </p>
          <p className="f-vt mt-3 max-w-sm text-xl text-white/80">
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
        onSaved={async () => {
          const ok = await load();
          if (ok) setScreen("welcome");
          return ok;
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
          className="f-mono absolute left-0 top-0 text-[11px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
        >
          ‹ Home
        </button>
        <button
          onClick={load}
          className="f-mono absolute right-0 top-0 text-[11px] uppercase tracking-[0.2em] text-cyan-300/90 hover:text-cyan-100"
        >
          ⟳ Sync
        </button>
        <Logo className="mx-auto" />
        <h1 className="f-pixel neon-text mt-4 text-2xl">TAP YOUR NAME</h1>
        <p className="f-vt glow-cyan mt-2 text-2xl">today&apos;s sessions</p>
      </div>

      {bookings.length === 0 ? (
        <div className="y2k-card px-6 py-12 text-center">
          <p className="f-pixel text-xs text-white/85">NO SESSIONS TODAY</p>
          <p className="f-vt mt-3 text-2xl text-white/75">the shop is quiet ✦ go make some art</p>
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
                <div className="f-mono mt-1.5 truncate text-[11px] uppercase tracking-wider text-white/80">
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
        className="f-mono mb-6 text-[11px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
      >
        ‹ Back
      </button>
      <h1 className="f-pixel glow-pink text-lg">CONFIRM YOUR DETAILS</h1>
      <p className="f-mono mt-2 text-[11px] uppercase tracking-wider text-cyan-300/90">
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
        <p className="f-vt mt-3 text-2xl leading-snug text-white/85">
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
        className="f-mono mt-10 w-full text-[11px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
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
  onSaved: () => Promise<boolean>;
  initialError: string | null;
  setErr: (s: string | null) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  // Provision the iPad: save the code, then confirm it actually loads. An empty
  // field disables the button (matches /start); a rejected code says so instead
  // of silently doing nothing.
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    setErr(null);
    setKioskToken(code.trim());
    const ok = await onSaved();
    if (!ok) {
      setError("That code didn't work. Check it with the shop and try again.");
      setBusy(false);
    }
    // On success the parent swaps to the welcome screen; leave busy set.
  };

  return (
    <Center>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Logo />
        <p className="f-pixel mt-6 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
          Enter the device code
        </p>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="DEVICE CODE"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          className="term mt-4 text-center"
        />
        {error && <div className="f-vt mt-3 text-xl text-rose-400">{error}</div>}
        <button
          onClick={submit}
          disabled={!code.trim() || busy}
          className="gel mt-5 w-full disabled:opacity-40"
        >
          {busy ? "CHECKING…" : "SET UP KIOSK ▸"}
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
      <span className="f-mono mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-lime-300/90">
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

// The shop TV: a real channel lineup as the fullscreen attract backdrop
// (muted — browsers require it for autoplay, and the shop runs its own sound
// anyway). Each reload tunes into a random channel at a random point; the CH
// buttons surf the dial via the IFrame API (loadVideoById — no iframe reload,
// mute state survives). pointer-events-none so a tap anywhere still checks in.
const SHOP_TV_CHANNELS: { num: number; id: string; len: number }[] = [
  { num: 2, id: "30wEwDz9WyM", len: 1698 },   // Good Morning America, 1992
  { num: 4, id: "ZD2GyA9hOqk", len: 4494 },   // Married with Children marathon
  { num: 5, id: "F1EYfSPThCk", len: 7234 },   // Nick Rewind: Clarissa, Kenan & Kel
  { num: 7, id: "hb5u3UD-A1k", len: 4308 },   // ABC TGIF commercials 1994-1996
  { num: 9, id: "GZnPR9CkqJs", len: 6307 },   // TMNT (1987) marathon
  { num: 11, id: "XTMjcM7HPUE", len: 7480 },  // 90s Nick cartoon chaos
  { num: 13, id: "mT0RNrTDHkI", len: 3582 },  // Bob Ross one-hour special (PBS dial)
  { num: 25, id: "xGgXu_m1_9I", len: 36413 }, // Fox Kids Saturday morning, 10h w/ commercials
  { num: 27, id: "EflI45HbiOQ", len: 12319 }, // 90s kids game shows w/ commercials
  { num: 33, id: "y0BerpDmVSE", len: 61 },    // Clarissa theme (the joke channel)
  { num: 38, id: "AeRTwWCCRaA", len: 3639 },  // late-90s basic cable commercials
  { num: 62, id: "UNb6iN-iALk", len: 3514 },  // 1990s commercials (Chicago VHS rips)
  { num: 99, id: "xBFuNlPzZrk", len: 31179 }, // Cartoon Network, 8h40m
];
// Random tune-in inside a video, leaving runway so it never starts at the end.
const tuneIn = (len: number) => (len < 300 ? 0 : Math.floor(Math.random() * (len - 120)));

function Welcome({ onBegin }: { onBegin: () => void }) {
  // The customer-facing attract screen — the idle state a walk-up sees (the
  // device-code screen is staff-only and never shown once provisioned). The whole
  // screen is the tap target. Live clock for a little retro arcade life.
  const [now, setNow] = useState<Date | null>(null);
  // Random tune-in point, chosen client-side after mount (no SSR mismatch).
  // Leave 10 minutes of runway so it never starts at the credits.
  const [tv, setTv] = useState<{ idx: number; start: number } | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [statics, setStatics] = useState(false);
  const [osd, setOsd] = useState(false);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tvRef = useRef<HTMLIFrameElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // Static SFX, tuned to the real thing: a low dial THUNK, then a burst of
  // band-filtered hiss with crackle pops riding on it, cut off abruptly when
  // the channel "locks in" (analog static never faded out politely).
  const playStaticSfx = (loud: boolean) => {
    try {
      const ctx = (audioRef.current ??= new AudioContext());
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = loud ? 0.5 : 0.16;
      master.connect(ctx.destination);

      // The dial thunk: a fast 75Hz knock.
      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(75, t0);
      thump.frequency.exponentialRampToValueAtTime(45, t0 + 0.07);
      const thumpGain = ctx.createGain();
      thumpGain.gain.setValueAtTime(0.9, t0);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      thump.connect(thumpGain).connect(master);
      thump.start(t0);
      thump.stop(t0 + 0.1);

      // The hiss: white noise with crackle spikes, through a TV-speaker band.
      const dur = 0.45;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < 26; i++) {
        // crackle: short loud pops scattered through the burst
        const at = Math.floor(Math.random() * (len - 90));
        const amp = 1.6 + Math.random() * 1.4;
        for (let j = 0; j < 90; j++) data[at + j] += (Math.random() * 2 - 1) * amp * (1 - j / 90);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 350; // tinny TV speaker, no real lows
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500; // analog rolloff up top
      const hissGain = ctx.createGain();
      hissGain.gain.setValueAtTime(1, t0);
      hissGain.gain.setValueAtTime(1, t0 + dur - 0.03);
      hissGain.gain.linearRampToValueAtTime(0, t0 + dur); // abrupt lock-in
      src.connect(hp).connect(lp).connect(hissGain).connect(master);
      src.start(t0);
    } catch {
      /* no audio context = silent dial */
    }
  };

  // The classic green on-screen display: pops on channel change (and when the
  // TV first turns on), lingers a beat, then fades like a real 90s set.
  const flashOsd = () => {
    setOsd(true);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(false), 3000);
  };
  useEffect(() => {
    setNow(new Date());
    const idx = Math.floor(Math.random() * SHOP_TV_CHANNELS.length);
    setTv({ idx, start: tuneIn(SHOP_TV_CHANNELS[idx].len) });
    const boot = setTimeout(() => flashOsd(), 1200); // OSD when the set warms up
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(t);
      clearTimeout(boot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmute is allowed after a real tap (autoplay must START muted) — drive the
  // player over the IFrame API's postMessage channel, no SDK script needed.
  const tvCommand = (func: string, args: unknown[] = []) =>
    tvRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*",
    );
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation(); // the sound button must not start check-in
    if (soundOn) {
      tvCommand("mute");
    } else {
      tvCommand("unMute");
      tvCommand("setVolume", [100]);
    }
    setSoundOn((s) => !s);
  };

  // Channel surf: step the dial through the real lineup, tuning into a random
  // spot on the next station, with a burst of static while the dial turns.
  const surf = (dir: 1 | -1) => {
    setTv((cur) => {
      if (!cur) return cur;
      const idx = (cur.idx + dir + SHOP_TV_CHANNELS.length) % SHOP_TV_CHANNELS.length;
      const ch = SHOP_TV_CHANNELS[idx];
      const start = tuneIn(ch.len);
      tvCommand("loadVideoById", [{ videoId: ch.id, startSeconds: start }]);
      return { idx, start };
    });
    // New loads can reset the player's mute — re-assert what the viewer chose.
    const keepSound = soundOn;
    setTimeout(() => {
      if (keepSound) {
        tvCommand("unMute");
        tvCommand("setVolume", [100]);
      } else {
        tvCommand("mute");
      }
    }, 900);
    playStaticSfx(soundOn);
    setStatics(true);
    setTimeout(() => setStatics(false), 450);
    flashOsd();
  };
  const surfRef = useRef(surf);
  surfRef.current = surf;

  const changeChannel = (dir: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    surf(dir);
  };

  // When a station runs out of tape, the set hops to the next channel on its
  // own. enablejsapi posts state events once we send the "listening" handshake.
  useEffect(() => {
    const handshake = setInterval(() => {
      tvRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: "shoptv", channel: "widget" }),
        "*",
      );
    }, 1500);
    const endedGuard = { current: false };
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== "string" || !String(e.origin).includes("youtube")) return;
      let msg: { event?: string; info?: number | { playerState?: number } } | null = null;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const state =
        msg?.event === "onStateChange"
          ? (msg.info as number)
          : msg?.event === "infoDelivery"
            ? (msg.info as { playerState?: number })?.playerState
            : undefined;
      if (state === 1) endedGuard.current = false; // playing again -> re-arm
      if (state === 0 && !endedGuard.current) {
        endedGuard.current = true; // one hop per ended video
        surfRef.current(1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      clearInterval(handshake);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <div
      onClick={onBegin}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onBegin()}
      className="relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden px-6 py-8 text-center"
    >
      {/* Fullscreen TV backdrop: 16:9 cover-sized iframe, dimmed so the neon reads. */}
      {tv !== null && (
        <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
          <iframe
            ref={tvRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            // Overscan like a real 90s set: oversize the player so the inner
            // 4:3 picture (or a baked pillarbox) always crops past the screen
            // edges — no black bars on any channel, whatever its upload shape.
            style={{ width: "max(177.78vh, 133.34vw)", height: "max(100vh, 75vw)" }}
            src={`https://www.youtube-nocookie.com/embed/${SHOP_TV_CHANNELS[tv.idx].id}?autoplay=1&mute=1&start=${tv.start}&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
            referrerPolicy="strict-origin-when-cross-origin"
            title="Shop TV"
            allow="autoplay; encrypted-media"
          />
          {/* Dim + vignette so the welcome chrome stays readable over cartoons. */}
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
          {/* 90s TV on-screen display: big green channel readout + MUTE */}
          {osd && (
            <div
              className="f-pixel absolute right-[6%] top-[8%] text-5xl text-lime-400"
              style={{ textShadow: "0 0 14px rgba(127,255,0,0.9), 3px 3px 0 rgba(0,40,0,0.8)" }}
            >
              CH {String(SHOP_TV_CHANNELS[tv.idx].num).padStart(2, "0")}
            </div>
          )}
          {!soundOn && (
            <div
              className="f-pixel absolute left-[6%] top-[8%] text-2xl text-lime-400"
              style={{ textShadow: "0 0 12px rgba(127,255,0,0.9), 2px 2px 0 rgba(0,40,0,0.8)" }}
            >
              MUTE
            </div>
          )}
          {/* Channel-change static burst */}
          {statics && <TvSnow />}
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center rounded-3xl bg-black/50 px-12 py-8 backdrop-blur-[2px]">
        <div className="f-mono mb-6 h-4 text-[12px] uppercase tracking-[0.3em] text-cyan-300">
          {now
            ? `${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            : ""}
        </div>
        <LumenatiLogo bg="dark" className="eye-glow w-40" />
        <h1 className="f-pixel neon-text mt-6 text-4xl">WELCOME</h1>
        <p className="f-vt glow-pink mt-3 text-3xl">lumenati tattoo // denver</p>
        <p className="f-pixel blink mt-10 text-xs uppercase tracking-[0.3em] text-lime-300">
          ▸ Tap anywhere to check in ◂
        </p>
      </div>

      {/* TV remote — bottom corner, isolated from the check-in tap. */}
      {tv !== null && (
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
          <button
            onClick={changeChannel(-1)}
            className="f-pixel rounded-lg border-2 border-cyan-300/70 bg-black/70 px-4 py-3.5 text-sm text-cyan-300 hover:text-cyan-100"
          >
            CH ▼
          </button>
          <button
            onClick={changeChannel(1)}
            className="f-pixel rounded-lg border-2 border-cyan-300/70 bg-black/70 px-4 py-3.5 text-sm text-cyan-300 hover:text-cyan-100"
          >
            CH ▲
          </button>
          <button
            onClick={toggleSound}
            className={`f-pixel rounded-lg border-2 px-5 py-3.5 text-sm ${
              soundOn
                ? "border-lime-300/80 bg-black/70 text-lime-300"
                : "border-white/30 bg-black/70 text-white/85 hover:text-white"
            }`}
          >
            {soundOn ? "♪ ON" : "♪ OFF"}
          </button>
        </div>
      )}
    </div>
  );
}

// Real analog snow: random grayscale pixels redrawn every frame on a small
// canvas, scaled up un-smoothed — the actual look of a dead channel, not a
// CSS stripe pattern. Runs only while the dial is mid-turn (~450ms).
function TvSnow() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = 240;
    const H = 135;
    canvas.width = W;
    canvas.height = H;
    const img = ctx.createImageData(W, H);
    const px = new Uint32Array(img.data.buffer);
    let raf = 0;
    const draw = () => {
      for (let i = 0; i < px.length; i++) {
        const v = (Math.random() * 256) | 0;
        px[i] = (255 << 24) | (v << 16) | (v << 8) | v;
      }
      // a couple of darker tear bands rolling through, like a lost signal
      const band = ((Math.random() * H) | 0) * W;
      for (let i = band; i < Math.min(band + W * 3, px.length); i++) px[i] = (255 << 24) | 0x202020;
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full opacity-90"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-6 py-8">{children}</div>;
}

function Logo({ className = "" }: { className?: string }) {
  // The all-seeing eye is peak Y2K/illuminati — keep it as the glowing hero.
  return <LumenatiLogo bg="dark" className={`eye-glow w-28 ${className}`} />;
}
