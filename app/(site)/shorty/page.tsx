import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function ShortyPage() {
  const html = readLegacyBlock("artist-shorty-y2k.html");
  return <LegacyBlock html={html} />;
}
