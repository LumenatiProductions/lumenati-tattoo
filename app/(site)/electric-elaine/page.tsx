import LegacyBlock from "@/components/LegacyBlock";
import { fetchRoom } from "@/lib/admin/room-data";
import { renderRoomHtml } from "@/lib/admin/render-room";

// Render fresh from the DB each request so artist edits go live immediately.
export const dynamic = "force-dynamic";

export default async function ElectricElainePage() {
  const html = renderRoomHtml(await fetchRoom("elaine"), "Electric Elaine", false);
  return <LegacyBlock html={html} />;
}
