"use client";

import { useRole } from "@/lib/admin/role-context";
import OwnerHome from "@/components/admin/home/OwnerHome";
import ArtistHome from "@/components/admin/home/ArtistHome";

// The home is role-routed: each role gets its own app (POS-STARTER-3), not the
// same dashboard with bits hidden. The components live in components/admin/home/.
export default function Overview() {
  const { role, asArtistId } = useRole();
  if (role === "artist") return <ArtistHome artistId={asArtistId} />;
  return <OwnerHome />;
}
