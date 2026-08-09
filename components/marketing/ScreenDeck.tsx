"use client";

import { useEffect, useRef, useState } from "react";
import { DesktopSlider } from "@/components/marketing/DesktopSlider";

// The back-office deck (MotionSites sticky-cards pattern): the five desktop
// screens ride in from below as you scroll and stack like sheets, each
// leaving its title strip peeking. The strips ARE the tabs: the active one
// tints pink, and clicking any strip scrolls to its screen. Cards run the
// full container width so the screens read near 1:1. Below lg, and for
// reduced motion, the swipe slider takes over.
export function ScreenDeck({
  screens,
}: {
  screens: readonly { img: string; title: string; body: string; alt: string }[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const n = screens.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    let raf = 0;
    const STRIP = 56;
    const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
    const frame = () => {
      raf = 0;
      const el = wrap.current;
      const st = stack.current;
      if (!el || !st) return;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      const total = Math.max(1, r.height - vh);
      const p = Math.min(1, Math.max(0, -r.top / total));
      const raw = p * (n - 1);
      const stackH = st.clientHeight;

      const ys: number[] = [];
      for (let i = 0; i < n; i++) {
        if (i === 0) {
          ys.push(0);
          continue;
        }
        const seg = Math.min(1, Math.max(0, raw - (i - 1)));
        ys.push(Math.round(stackH + STRIP + (i * STRIP - (stackH + STRIP)) * easeOut(seg)));
      }
      const cards = st.children;
      for (let i = 0; i < n; i++) {
        const card = cards[i] as HTMLElement;
        if (!card) continue;
        const nextY = ys[i + 1];
        const visible =
          typeof nextY === "number" ? Math.max(STRIP, Math.min(stackH, nextY - ys[i] + 2)) : stackH;
        card.style.setProperty("--deck-y", `${ys[i]}px`);
        card.style.setProperty("--deck-clip", `${Math.max(0, stackH - visible)}px`);
        card.style.zIndex = String(i + 1);
      }
      setActive(Math.min(n - 1, Math.max(0, Math.round(raw))));
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
  }, [n]);

  const jumpTo = (i: number) => {
    const el = wrap.current;
    if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: el.offsetTop + (i / (n - 1)) * total, behavior: "smooth" });
  };

  if (reduced) return <DesktopSlider screens={screens} />;

  return (
    <div ref={wrap} className="mkt-deck" style={{ height: `${120 + n * 60}vh` }}>
      <div className="mkt-deck-sticky">
        <div ref={stack} className="mkt-deck-stack">
          {screens.map((s, i) => (
            <article key={s.img} className={`mkt-deck-card ${i === active ? "is-on" : ""}`}>
              <button type="button" className="mkt-deck-strip" onClick={() => jumpTo(i)}>
                <span className="mkt-deck-title">{s.title}</span>
                <span className="mkt-deck-body">{s.body}</span>
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.img} alt={s.alt} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
