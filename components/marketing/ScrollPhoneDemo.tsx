"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneDemo } from "@/components/marketing/PhoneDemo";

const SCREEN_H = 660;

// The scroll takeover. The section is several viewports tall; a sticky stage
// pins the phone while you scroll. First the phone grows until it owns the
// screen, then continued scrolling scrolls THROUGH the app (the screens ride
// by inside the glass), then the page releases and moves on. Transforms are
// written straight to the DOM per frame; React state only tracks which
// caption is live. Reduced-motion users get the tilt demo instead.
export function ScrollPhoneDemo({
  screens,
}: {
  screens: readonly { img: string; alt: string; cap: string }[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    let raf = 0;
    const frame = () => {
      raf = 0;
      const el = wrap.current;
      const ph = phone.current;
      const st = strip.current;
      if (!el || !ph || !st) return;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      const total = r.height - vh;
      const p = Math.min(1, Math.max(0, -r.top / total));

      // Grow to own the screen, hold, then hand the frame back.
      const grown = Math.min((vh * 0.88) / (SCREEN_H + 24), 1.3);
      const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
      const pin = Math.min(1, p / 0.16);
      const pout = Math.max(0, (p - 0.9) / 0.1);
      const scale = (0.62 + (grown - 0.62) * easeOut(pin)) * (1 - 0.12 * pout);
      ph.style.transform = `scale(${scale.toFixed(4)})`;

      // The middle of the ride scrolls the app inside the glass.
      const q = Math.min(1, Math.max(0, (p - 0.18) / 0.64));
      const shift = q * (screens.length - 1) * SCREEN_H;
      st.style.transform = `translateY(-${shift.toFixed(1)}px)`;
      setActive(Math.min(screens.length - 1, Math.round(q * (screens.length - 1))));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [screens.length]);

  if (reduced) return <PhoneDemo screens={screens} />;

  return (
    <div ref={wrap} className="mkt-scrolldemo" style={{ height: "320vh" }}>
      <div className="mkt-scrolldemo-sticky">
        <div ref={phone} className="mkt-phone mkt-scrolldemo-phone">
          <div className="mkt-scrolldemo-viewport">
            <div ref={strip} className="mkt-scrolldemo-strip">
              {screens.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.img} src={s.img} alt={s.alt} />
              ))}
            </div>
          </div>
        </div>
        <div className="mkt-scrolldemo-caption">
          {screens.map((s, i) => (
            <span key={s.img} className={i === active ? "is-on" : ""} aria-hidden={i !== active}>
              {s.cap}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
