"use client";

import { useEffect, useRef, useState } from "react";

// The demo phone: one big handset that tilts in 3D toward the cursor, lifts
// on hover, and flips between real app screens. Chips below drive the screen;
// left alone it auto-advances. Desktop only (the mobile carousel stays).
export function PhoneDemo({
  screens,
}: {
  screens: readonly { img: string; alt: string; cap: string }[];
}) {
  const [active, setActive] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const restartTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setActive((v) => (v + 1) % screens.length), 4500);
  };

  useEffect(() => {
    restartTimer();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens.length]);

  return (
    <div className="mkt-demo">
      <div
        ref={stage}
        className="mkt-demo-stage"
        onPointerMove={(e) => {
          const el = stage.current;
          if (!el) return;
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          const r = el.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          el.style.setProperty("--tilt-y", `${(nx * 22).toFixed(2)}deg`);
          el.style.setProperty("--tilt-x", `${(-ny * 16).toFixed(2)}deg`);
          el.style.setProperty("--glare-x", `${((nx + 0.5) * 100).toFixed(1)}%`);
          el.style.setProperty("--glare-y", `${((ny + 0.5) * 100).toFixed(1)}%`);
        }}
        onPointerLeave={() => {
          const el = stage.current;
          if (!el) return;
          el.style.setProperty("--tilt-y", "0deg");
          el.style.setProperty("--tilt-x", "0deg");
        }}
      >
        <div className="mkt-phone mkt-demo-phone">
          <div className="mkt-demo-screens">
            {screens.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.img} src={s.img} alt={s.alt} className={i === active ? "is-on" : ""} />
            ))}
          </div>
          <div className="mkt-demo-glare" />
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        {screens.map((s, i) => (
          <button
            key={s.img}
            type="button"
            onClick={() => {
              setActive(i);
              restartTimer();
            }}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              i === active
                ? "border-white/45 bg-white/15 text-white"
                : "border-white/12 bg-white/[0.04] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
            }`}
          >
            {s.cap}
          </button>
        ))}
      </div>
    </div>
  );
}
