"use client";

import { useEffect, useState } from "react";

// One phrase at a time, rolling on a timer with a blur-up transition (CSS in
// shops.css). All phrases render stacked in one grid cell so the widest one
// sets the width and nothing reflows. Reduced-motion users see the first
// phrase, static.
export function RotatingWords({
  words,
  interval = 2200,
  className = "",
}: {
  words: readonly string[];
  interval?: number;
  className?: string;
}) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setOn((v) => (v + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);
  return (
    <span className={`mkt-rotator ${className}`}>
      {words.map((w, i) => (
        <span key={w} className={`mkt-rotator-word ${i === on ? "is-on" : ""}`} aria-hidden={i !== on}>
          {w}
        </span>
      ))}
    </span>
  );
}
