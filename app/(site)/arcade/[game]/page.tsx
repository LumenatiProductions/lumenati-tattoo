import LegacyBlock from "@/components/LegacyBlock";
import { notFound } from "next/navigation";
import { buildArcadePreviewHtml } from "@/lib/arcade-preview";
import { fetchArtists } from "@/lib/admin/artists-data";

// Every arcade game playable at /arcade/<id> — the test bench with a switcher
// row. The room cabinet loads its cartridges from /arcade-embed/<id> instead
// (a bare route with none of the site chrome).
export const dynamic = "force-dynamic";

export default async function ArcadePreviewPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  let crew: string[] = [];
  try { crew = (await fetchArtists()).map((a) => a.handle).filter(Boolean); } catch { /* credits fall back */ }
  const html = buildArcadePreviewHtml(game, { crew });
  if (!html) notFound();
  return <LegacyBlock html={html} />;
}
