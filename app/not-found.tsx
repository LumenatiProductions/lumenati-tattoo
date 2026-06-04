import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

// Blue Screen of Death 404, ported from 404-bsod.html. Self-contained, so it
// does not need the site-wide bundle.
export default function NotFound() {
  const html = readLegacyBlock("404-bsod.html");
  return <LegacyBlock html={html} />;
}
