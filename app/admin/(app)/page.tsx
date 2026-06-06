"use client";

import { useRole } from "@/lib/admin/role-context";
import OwnerHome from "@/components/admin/home/OwnerHome";
import BookkeeperHome from "@/components/admin/home/BookkeeperHome";
import FrontDeskHome from "@/components/admin/home/FrontDeskHome";
import ArtistHome from "@/components/admin/home/ArtistHome";

// The home is role-routed: each role gets its own app (POS-STARTER-3), not the
// same dashboard with bits hidden. The components live in components/admin/home/.
export default function Overview() {
  const { role, asArtistId } = useRole();
  if (role === "artist") return <ArtistHome artistId={asArtistId} />;
  if (role === "frontdesk") return <FrontDeskHome />;
  if (role === "bookkeeper") return <BookkeeperHome />;
  return <OwnerHome />;
}
