"use client";

import { useEffect, useRef } from "react";

/**
 * Renders a raw legacy HTML block (markup + inline <style> + inline/external
 * <script>) and makes its scripts actually run.
 *
 * React does NOT execute <script> tags inserted via innerHTML, so after the
 * markup is in the DOM we clone each script into a fresh element and append it,
 * which forces the browser to execute it (inline runs immediately, external
 * loads then runs). The original Y2K blocks initialise via immediate IIFEs, so
 * re-running on mount reproduces their Squarespace behaviour faithfully.
 *
 * `fireLoad` dispatches a synthetic window "load" event after the scripts run.
 * The code-injection footer bundle gates some init (e.g. the sparkle cursor) on
 * window load, which has already fired by the time React mounts — this kicks it.
 */
export default function LegacyBlock({
  html,
  fireLoad = false,
}: {
  html: string;
  fireLoad?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    container.innerHTML = html;

    // Re-execute every <script> in the injected markup.
    const scripts = Array.from(container.querySelectorAll("script"));
    for (const old of scripts) {
      const fresh = document.createElement("script");
      for (const attr of Array.from(old.attributes)) {
        fresh.setAttribute(attr.name, attr.value);
      }
      fresh.textContent = old.textContent;
      old.parentNode?.replaceChild(fresh, old);
    }

    if (fireLoad) {
      // Let any freshly-appended external scripts attach their listeners first.
      const t = setTimeout(() => {
        window.dispatchEvent(new Event("load"));
      }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} suppressHydrationWarning />;
}
