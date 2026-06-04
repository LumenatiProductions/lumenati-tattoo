import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function MoonieBJonesPage() {
  const html = readLegacyBlock("artist-moonie-y2k.html");
  return <LegacyBlock html={html} />;
}
