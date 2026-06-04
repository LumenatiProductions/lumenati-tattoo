import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function SamDurbinClarkPage() {
  const html = readLegacyBlock("artist-sam-y2k.html");
  return <LegacyBlock html={html} />;
}
