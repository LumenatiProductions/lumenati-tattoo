import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function ElectricElainePage() {
  const html = readLegacyBlock("artist-elaine-y2k.html");
  return <LegacyBlock html={html} />;
}
