"use client";

import { useEffect, useRef, useState } from "react";
import { ARCADE_OPEN_EVENT } from "@/components/kiosk/KioskArcade";
import { SHOP_TV_CHANNELS } from "@/lib/kiosk/tv-channels";

// Random tune-in inside a video, leaving runway so it never starts at the end.
const tuneIn = (len: number) => (len < 300 ? 0 : Math.floor(Math.random() * (len - 120)));

// The 90s cable guide: a Prevue-style grid that crawls up the bottom half of the
// screen on its own while the TV keeps playing above it. A finger stops the
// crawl; a tap on a row tunes the set to that channel.
function PrevueGuide({
  current,
  now,
  onTune,
  onClose,
}: {
  current: number;
  now: Date | null;
  onTune: (idx: number) => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const pausedUntil = useRef(0);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    // Open on the channel you're watching, a few rows down so it stays in view
    // for a while as the grid crawls.
    el.scrollTop = Math.max(0, current * ROW_H - ROW_H * 5);
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      if (t > pausedUntil.current) {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = el.scrollTop >= max - 1 ? 0 : el.scrollTop + (dt / 1000) * CRAWL_PX_PER_S;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hold = () => {
    pausedUntil.current = performance.now() + 5000; // a finger on it = stop crawling for a bit
  };
  const clock = now
    ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <div
      className="fixed inset-x-0 bottom-0 flex flex-col"
      style={{ zIndex: 40, height: "56vh", background: "#0a0a7a", borderTop: "4px solid #ffd700", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="f-pixel flex items-center justify-between px-5"
        style={{ height: 48, background: "linear-gradient(180deg,#1c1cb8 0%,#05055a 100%)", color: "#ffd700", fontSize: 15, letterSpacing: "0.06em", borderBottom: "2px solid #ffd700" }}
      >
        <span>LUMENATI CABLE // PREVUE GUIDE</span>
        <span className="flex items-center gap-4">
          <span style={{ color: "#fff" }}>{clock}</span>
          <button
            type="button"
            onClick={onClose}
            className="f-pixel rounded border-2 border-yellow-300 px-3 py-1.5 text-yellow-200"
            style={{ background: "#000", fontSize: 12 }}
          >
            CLOSE &#10005;
          </button>
        </span>
      </div>
      <div
        ref={list}
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "none", overscrollBehavior: "contain", paddingBottom: 92 }}
        onPointerDown={hold}
        onTouchStart={hold}
        onWheel={hold}
        onScroll={() => {
          // a user-driven scroll keeps the crawl paused; the RAF loop's own
          // scroll lands inside the pause window too, harmless
        }}
      >
        {SHOP_TV_CHANNELS.map((ch, idx) => {
          const here = idx === current;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onTune(idx)}
              className="f-pixel flex w-full items-center text-left"
              style={{
                height: ROW_H,
                background: here ? "#ffd700" : idx % 2 ? "#0d0d8a" : "#0a0a7a",
                color: here ? "#05055a" : "#fff",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
                fontSize: 15,
              }}
            >
              <span
                className="flex h-full shrink-0 items-center justify-end pr-4"
                style={{ width: 110, background: here ? "#ffea70" : "#05055a", color: here ? "#05055a" : "#ffd700" }}
              >
                CH {ch.num}
              </span>
              <span className="truncate px-4 uppercase">{ch.name}</span>
              {here && <span className="ml-auto shrink-0 pr-4 text-xs">NOW</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const ROW_H = 46;
const CRAWL_PX_PER_S = 34; // about one row every 1.3s, the Prevue pace

// The shop TV: a fullscreen cable set with a remote (guide, channel up and
// down, sound) and the ARCADE button that flips it to the game cabinet. The
// kiosk's welcome screen wraps it (tap anywhere = check in); /tv runs it bare
// for anyone who just wants to watch. Children render over the picture;
// extra lands in the remote row.
export function ShopTv({
  onTap,
  children,
  extra,
}: {
  onTap?: () => void;
  children?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [now, setNow] = useState<Date | null>(null);
  // Random tune-in point, chosen client-side after mount (no SSR mismatch).
  // Leave 10 minutes of runway so it never starts at the credits.
  const [tv, setTv] = useState<{ idx: number; start: number } | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [statics, setStatics] = useState(false);
  const [osd, setOsd] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
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
  // No captions on the shop TV: YouTube switches them on for any viewer whose
  // account has them on, and they land as big subtitles across the attract screen.
  const hideCaptions = () => {
    tvCommand("setOption", ["captions", "track", {}]);
    tvCommand("unloadModule", ["captions"]);
  };
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

  // Tune straight to a channel index: load it at a random spot, re-assert the
  // viewer's sound choice (new loads can reset the player's mute), static burst.
  const tuneTo = (idx: number) => {
    const ch = SHOP_TV_CHANNELS[idx];
    const start = tuneIn(ch.len);
    tvCommand("loadVideoById", [{ videoId: ch.id, startSeconds: start }]);
    setTv({ idx, start });
    const keepSound = soundOn;
    setTimeout(() => {
      if (keepSound) {
        tvCommand("unMute");
        tvCommand("setVolume", [100]);
      } else {
        tvCommand("mute");
      }
      hideCaptions();
    }, 900);
    playStaticSfx(soundOn);
    setStatics(true);
    setTimeout(() => setStatics(false), 450);
    flashOsd();
  };
  // Channel surf: step the dial through the lineup.
  const surf = (dir: 1 | -1) => {
    if (!tv) return;
    tuneTo((tv.idx + dir + SHOP_TV_CHANNELS.length) % SHOP_TV_CHANNELS.length);
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
      hideCaptions();
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
      onClick={onTap}
      role={onTap ? "button" : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? (e) => (e.key === "Enter" || e.key === " ") && onTap() : undefined}
      className={`relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-8 text-center ${onTap ? "cursor-pointer" : ""}`}
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

      {children}

      {/* TV remote — bottom corner, isolated from the check-in tap. ARCADE
          switches the set over to the game cabinet (KioskArcade, in the layout). */}
      <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            // The cabinet has its own sound; the TV goes quiet when it boots.
            if (soundOn) {
              tvCommand("mute");
              setSoundOn(false);
            }
            window.dispatchEvent(new Event(ARCADE_OPEN_EVENT));
          }}
          className="f-pixel rounded-lg border-2 border-pink-500/80 bg-black/70 px-5 py-3.5 text-sm text-pink-400 hover:text-pink-200"
        >
          ARCADE
        </button>
      {tv !== null && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setGuideOpen((g) => !g);
            }}
            className={`f-pixel rounded-lg border-2 bg-black/70 px-4 py-3.5 text-sm ${
              guideOpen ? "border-yellow-300 text-yellow-200" : "border-yellow-300/70 text-yellow-300 hover:text-yellow-100"
            }`}
          >
            GUIDE
          </button>
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
        </>
      )}
      {extra}
      </div>
      {tv !== null && guideOpen && (
        <PrevueGuide
          current={tv.idx}
          now={now}
          onTune={(idx) => {
            tuneTo(idx);
            setGuideOpen(false);
          }}
          onClose={() => setGuideOpen(false)}
        />
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
