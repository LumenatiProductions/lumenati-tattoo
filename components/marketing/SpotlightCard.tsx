"use client";

import { useRef } from "react";

// A glass card whose 1px ring brightens around the cursor. The ring itself is
// painted in CSS (.mkt-spot::after); this component only feeds it the pointer
// position via CSS variables. Touch devices simply never see the highlight.
export function SpotlightCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`mkt-glass mkt-spot ${className}`}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
        el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
      }}
      onPointerLeave={() => {
        ref.current?.style.setProperty("--spot-x", "-9999px");
        ref.current?.style.setProperty("--spot-y", "-9999px");
      }}
    >
      {children}
    </div>
  );
}
