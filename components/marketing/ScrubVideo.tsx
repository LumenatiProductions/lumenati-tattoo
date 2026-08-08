"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-scrubbed video (MotionSites pattern): the section pins a laptop
// playing a real Command Center drive, and the page's scroll position IS the
// play head. The video.seeking guard keeps rapid scroll events from stacking
// seeks (that's what causes tearing). Reduced motion gets the still.
export function ScrubVideo({
  src,
  poster,
}: {
  src: string;
  poster: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
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
      const v = vid.current;
      if (!el || !v || !v.duration || v.seeking) return;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      const total = Math.max(1, r.height - vh);
      const p = Math.min(1, Math.max(0, -r.top / total));
      v.currentTime = p * v.duration;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const v = vid.current;
    // A completed seek may have skipped newer scroll events; catch up once.
    const onSeeked = () => onScroll();
    v?.addEventListener("seeked", onSeeked);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      v?.removeEventListener("seeked", onSeeked);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={wrap} className="mkt-scrub" style={{ height: reduced ? "auto" : "280vh" }}>
      <div className={reduced ? "py-10" : "mkt-scrub-sticky"}>
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
            The back office, in motion
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            Scroll to run the shop<span className="text-brand">.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Your scroll is the play head. This is the real Command Center.
          </p>
        </div>
        <div className="mkt-scrub-laptop">
          <div className="mkt-laptop-screen">
            <div className="mkt-laptop-bar">
              <span />
              <span />
              <span />
            </div>
            {reduced ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="The Lumenati Command Center overview" />
            ) : (
              <video ref={vid} src={src} poster={poster} muted playsInline preload="auto" />
            )}
          </div>
          <div className="mkt-laptop-base" />
        </div>
      </div>
    </div>
  );
}
