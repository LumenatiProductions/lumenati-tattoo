"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneDemo } from "@/components/marketing/PhoneDemo";

const VIEW_W = 330;
const VIEW_H = 660;

// The hero AND the takeover, one stage. At rest: the hero copy owns the left
// and the phone sits on the right at hero size. Scrolling picks the phone up:
// the hero copy hands off to the story headlines in the same spot while the
// phone grows in place and the REAL app (one continuous full-height capture)
// scrolls inside the glass. Transforms are written per-frame to the DOM;
// React only tracks the live headline. Reduced motion gets the hero copy
// above the tilt demo.
export function ScrollPhoneDemo({
  img,
  stops,
  fallback,
  hero,
  strip,
}: {
  img: { src: string; alt: string };
  stops: readonly { at: number; head: string; sub: string }[];
  fallback: readonly { img: string; alt: string; cap: string }[];
  hero: React.ReactNode;
  strip?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLImageElement>(null);
  const heads = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    let raf = 0;
    const travel = () => {
      const im = shot.current;
      if (!im || !im.naturalWidth) return 0;
      return Math.max(0, (im.naturalHeight * VIEW_W) / im.naturalWidth - VIEW_H);
    };
    // The section is as tall as the ride needs: one viewport at rest, the
    // app scroll at a comfortable rate, one viewport to hand back.
    const size = () => {
      const el = wrap.current;
      if (!el) return;
      el.style.height = `${Math.round(window.innerHeight * 2 + travel() * 1.5)}px`;
    };
    const frame = () => {
      raf = 0;
      const el = wrap.current;
      const ph = phone.current;
      const im = shot.current;
      const hd = heads.current;
      const hr = heroRef.current;
      if (!el || !ph || !im) return;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const total = el.getBoundingClientRect().height - vh;
      if (total <= 0) return;
      const p = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / total));

      // The phone lives on the right the whole time; at rest it fills about
      // two thirds of the viewport (tall monitors get a bigger phone, not a
      // bigger gap) and sits a touch low, then the pickup grows it in place
      // and the release hands the frame back.
      const grown = Math.min((vh * 0.88) / (VIEW_H + 24), 1.3);
      const rest = Math.max(0.78, Math.min(1.05, (vh * 0.66) / (VIEW_H + 24)));
      const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
      const pin = Math.min(1, p / 0.13);
      const pout = Math.max(0, (p - 0.92) / 0.08);
      const scale = (rest + (grown - rest) * easeOut(pin)) * (1 - 0.1 * pout);
      // Offset from the FRAME's center (page-width container), not the
      // viewport, so wide monitors keep copy and phone composed together.
      const frameW = Math.min(vw, 1152);
      const tx = Math.max(150, frameW / 2 - 300);
      const settle = (1 - easeOut(pin)) * vh * 0.03;
      ph.style.transform = `translate(${tx.toFixed(1)}px, ${settle.toFixed(1)}px) scale(${scale.toFixed(4)})`;

      // Left column handoff: hero copy out, story headlines in.
      if (hr) {
        hr.style.opacity = (1 - easeOut(pin)).toFixed(2);
        // Compose with the CSS -50% vertical centering.
        hr.style.transform = `translateY(-50%) translateY(${(-34 * easeOut(pin)).toFixed(1)}px)`;
        hr.style.pointerEvents = pin > 0.4 ? "none" : "";
      }
      if (hd) hd.style.opacity = (easeOut(pin) * (1 - pout)).toFixed(2);
      // The marquee rides the bottom of the header frame and breaks away
      // with the copy as the pickup begins.
      const sb = stripRef.current;
      if (sb) {
        sb.style.opacity = (1 - easeOut(pin)).toFixed(2);
        sb.style.transform = `translateY(${(26 * easeOut(pin)).toFixed(1)}px)`;
      }

      // The middle of the ride scrolls the app inside the glass.
      const q = Math.min(1, Math.max(0, (p - 0.14) / 0.76));
      im.style.transform = `translateY(-${(q * travel()).toFixed(1)}px)`;
      let cap = 0;
      stops.forEach((s, i) => {
        if (q >= s.at) cap = i;
      });
      setActive(cap);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      size();
      onScroll();
    };
    const im = shot.current;
    if (im) {
      if (im.complete) size();
      else im.addEventListener("load", onResize, { once: true });
    }
    size();
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [stops]);

  if (reduced)
    return (
      <div>
        <div className="mx-auto max-w-xl px-5 pt-32 text-center">{hero}</div>
        <PhoneDemo screens={fallback} />
      </div>
    );

  return (
    <div ref={wrap} className="mkt-scrolldemo" style={{ height: "320vh" }}>
      <div className="mkt-scrolldemo-sticky">
        {/* The composed frame: copy and headlines position against this
            page-width container, not the viewport, so wide monitors don't
            open a canyon between the copy and the phone. */}
        <div className="mkt-scrolldemo-frame">
          {/* The left column: hero copy at rest, story headlines on the ride. */}
          <div ref={heroRef} className="mkt-scrolldemo-hero">
            {hero}
          </div>
          <div ref={heads} className="mkt-scrolldemo-heads" style={{ opacity: 0 }}>
            {stops.map((s, i) => (
              <div key={s.head} className={`mkt-sd-head ${i === active ? "is-on" : ""}`} aria-hidden={i !== active}>
                <h3 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
                  {s.head}
                  <span className="text-brand">.</span>
                </h3>
                <p className="mt-4 max-w-sm text-base text-zinc-400 sm:text-lg">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
        <div ref={phone} className="mkt-phone mkt-scrolldemo-phone">
          <div className="mkt-scrolldemo-viewport">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={shot} src={img.src} alt={img.alt} className="mkt-scrolldemo-shot" />
          </div>
        </div>
        {strip && (
          <div ref={stripRef} className="mkt-scrolldemo-marquee">
            {strip}
          </div>
        )}
      </div>
    </div>
  );
}
