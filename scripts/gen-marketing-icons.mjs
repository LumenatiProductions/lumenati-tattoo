#!/usr/bin/env node
// Generate components/marketing/Icon.tsx from the official `ionicons` package
// (the same icon set the app uses via @expo/vector-icons Ionicons). Maps the
// friendly names used on the marketing page to the Ionicons outline SVGs and
// inlines the raw markup (rendered via dangerouslySetInnerHTML so hyphenated
// SVG attributes survive without JSX rewriting).
//
// Run: node scripts/gen-marketing-icons.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SVG = join(root, "node_modules", "ionicons", "dist", "svg");

// friendly name (used in page.tsx) -> Ionicons file
const MAP = {
  cash: "cash-outline",
  goal: "trending-up-outline",
  shield: "shield-checkmark-outline",
  chat: "chatbubbles-outline",
  clock: "stopwatch-outline",
  ribbon: "ribbon-outline",
  bars: "bar-chart-outline",
  bulb: "bulb-outline",
  book: "book-outline",
  flag: "flag-outline",
  repeat: "repeat-outline",
  people: "people-outline",
  chevronLeft: "chevron-back-outline",
  chevronRight: "chevron-forward-outline",
  check: "checkmark-outline",
  doc: "document-text-outline",
  tablet: "tablet-portrait-outline",
};

const entries = Object.entries(MAP)
  .map(([name, file]) => {
    const svg = readFileSync(join(SVG, `${file}.svg`), "utf8");
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
    return `  ${JSON.stringify(name)}: ${JSON.stringify(inner)},`;
  })
  .join("\n");

const out = `// Real Ionicons (v8) — the same icon set the product uses (@expo/vector-icons
// Ionicons on the app). Generated from the ionicons package by
// scripts/gen-marketing-icons.mjs; raw SVG rendered via dangerouslySetInnerHTML
// so the exact product glyphs render with no runtime. Do not edit by hand.

const ICONS: Record<string, string> = {
${entries}
};

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />
  );
}
`;

writeFileSync(join(root, "components", "marketing", "Icon.tsx"), out);
console.log(`wrote components/marketing/Icon.tsx (${Object.keys(MAP).length} icons)`);
