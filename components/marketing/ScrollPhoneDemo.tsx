"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneDemo } from "@/components/marketing/PhoneDemo";

const VIEW_W = 330;
const VIEW_H = 660;

// The scroll takeover. A sticky stage pins the phone while you scroll: the
// phone grows to own the screen, then your scrolling scrolls the REAL app,
// one continuous full-height capture of the artist home (public/marketing/
// app-artist-scroll.webp), then the page releases. Captions crossfade at
// content landmarks (stops). Transforms are written per-frame to the DOM;
// React only tracks the live caption. Reduced motion gets the tilt demo.
export function ScrollPhoneDemo({
  img,
  stops,
  fallback,
}: {
  img: { src: string; alt: string };
  stops: readonly { at: number; cap: string }[];
  fallback: readonly { img: string; alt: string; cap: string }[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLImageElement>(null);
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
    // The section is as tall as the ride needs: one viewport to grow, the
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
      if (!el || !ph || !im) return;
      const vh = window.innerHeight;
      const total = el.getBoundingClientRect().height - vh;
      if (total <= 0) return;
      const p = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / total));

      // Grow to own the screen, hold, then hand the frame back.
      const grown = Math.min((vh * 0.88) / (VIEW_H + 24), 1.3);
      const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
      const pin = Math.min(1, p / 0.13);
      const pout = Math.max(0, (p - 0.92) / 0.08);
      const scale = (0.62 + (grown - 0.62) * easeOut(pin)) * (1 - 0.1 * pout);
      ph.style.transform = `scale(${scale.toFixed(4)})`;

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

  if (reduced) return <PhoneDemo screens={fallback} />;

  return (
    <div ref={wrap} className="mkt-scrolldemo" style={{ height: "320vh" }}>
      <div className="mkt-scrolldemo-sticky">
        <div ref={phone} className="mkt-phone mkt-scrolldemo-phone">
          <div className="mkt-scrolldemo-viewport">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={shot} src={img.src} alt={img.alt} className="mkt-scrolldemo-shot" />
          </div>
        </div>
        <div className="mkt-scrolldemo-caption">
          {stops.map((s, i) => (
            <span key={s.cap} className={i === active ? "is-on" : ""} aria-hidden={i !== active}>
              {s.cap}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
