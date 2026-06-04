import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function KingKalypsoPage() {
  const html = readLegacyBlock("artist-kalypso-y2k.html");
  return <LegacyBlock html={html} />;
}
