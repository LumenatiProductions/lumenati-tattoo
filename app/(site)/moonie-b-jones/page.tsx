import LegacyBlock from "@/components/LegacyBlock";
import { fetchRoom } from "@/lib/admin/room-data";
import { renderRoomHtml } from "@/lib/admin/render-room";

// Render fresh from the DB each request so artist edits go live immediately.
export const dynamic = "force-dynamic";

export default async function MoonieBJonesPage() {
  const html = renderRoomHtml(await fetchRoom("moonie"), "Moonie B. Jones", false);
  return <LegacyBlock html={html} />;
}
