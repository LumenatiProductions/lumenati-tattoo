import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

export default function BookPage() {
  const html = readLegacyBlock("contact-y2k.html");
  return <LegacyBlock html={html} />;
}
