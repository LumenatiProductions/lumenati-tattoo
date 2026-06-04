import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function JdPruittPage() {
  const html = readLegacyBlock("artist-page-y2k.html");
  return <LegacyBlock html={html} />;
}
