"use client";

import { useRef } from "react";
import { Icon } from "./Icon";

type Screen = { img: string; title: string; body: string; alt: string };

// The shop back-office slider with prev/next arrows (desktop). On touch it's
// a plain scroll-snap swipe; the arrows are a convenience on wider screens.
export function DesktopSlider({ screens }: { screens: readonly Screen[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>(".mkt-slide");
    const step = slide ? slide.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={ref} className="mkt-slider mt-12">
        {screens.map((s) => (
          <figure key={s.img} className="mkt-slide">
            <div className="mkt-browser">
              <div className="mkt-browser-bar">
                <span />
                <span />
                <span />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.img} alt={s.alt} />
            </div>
            <figcaption className="mt-4 text-sm text-zinc-400">
              <span className="font-semibold text-white">{s.title}.</span> {s.body}
            </figcaption>
          </figure>
        ))}
      </div>

      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Previous screen"
        className="mkt-slider-arrow absolute -left-3 top-[42%] hidden -translate-y-1/2 lg:flex"
      >
        <Icon name="chevronLeft" className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="Next screen"
        className="mkt-slider-arrow absolute -right-3 top-[42%] hidden -translate-y-1/2 lg:flex"
      >
        <Icon name="chevronRight" className="h-5 w-5" />
      </button>
    </div>
  );
}
