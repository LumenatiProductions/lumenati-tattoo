"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Slide = { img: string; alt: string; cap: string };

// Centered, infinite, auto-advancing phone carousel. Renders three copies of
// the slides so wrapping is seamless: the visible band lives in the middle
// copy, and when we drift out we snap back a copy with no animation (the
// content is identical, so it's invisible). Auto-advances every 5s.
export function PhoneCarousel({ slides }: { slides: Slide[] }) {
  const N = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(N); // start centered on the first item, middle copy
  const [animate, setAnimate] = useState(true);
  const [m, setM] = useState({ step: 0, offset: 0 });

  const measure = useCallback(() => {
    const track = trackRef.current;
    const slide = track?.children[0] as HTMLElement | undefined;
    if (!track || !slide) return;
    const cs = getComputedStyle(track);
    const gap = parseFloat(cs.columnGap || cs.gap || "24") || 24;
    const w = slide.getBoundingClientRect().width;
    const cont = (track.parentElement as HTMLElement).getBoundingClientRect().width;
    setM({ step: w + gap, offset: (cont - w) / 2 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const go = useCallback((d: number) => {
    setAnimate(true);
    setPos((p) => p + d);
  }, []);

  useEffect(() => {
    const id = setInterval(() => go(1), 5000);
    return () => clearInterval(id);
  }, [go]);

  // Re-enable animation the frame after a no-anim snap.
  useEffect(() => {
    if (!animate) {
      const r = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(r);
    }
  }, [animate]);

  const onTransitionEnd = (e: React.TransitionEvent) => {
    if (e.propertyName !== "transform" || e.target !== trackRef.current) return;
    if (pos >= 2 * N || pos < N) {
      setAnimate(false);
      setPos((pos % N) + N);
    }
  };

  const active = ((pos % N) + N) % N;
  const rendered = [...slides, ...slides, ...slides];
  const x = m.offset - pos * m.step;

  return (
    <div className="mx-auto max-w-[460px]">
      <div className="overflow-hidden">
        <div
          ref={trackRef}
          className="flex gap-6"
          onTransitionEnd={onTransitionEnd}
          style={{
            transform: `translateX(${x}px)`,
            transition: animate ? "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            opacity: m.step ? 1 : 0,
            willChange: "transform",
          }}
        >
          {rendered.map((s, i) => (
            <figure
              key={i}
              className="flex-none transition-opacity duration-500"
              style={{ opacity: i === pos ? 1 : 0.55 }}
            >
              <div className="mkt-phone mkt-phone-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.img} alt={s.alt} />
              </div>
            </figure>
          ))}
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-zinc-400">{slides[active].cap}</p>
      <div className="mt-3 flex justify-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i - active)}
            aria-label={`Show slide ${i + 1}`}
            className={`h-2 rounded-full transition-all ${i === active ? "w-5 bg-brand" : "w-2 bg-white/25 hover:bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
