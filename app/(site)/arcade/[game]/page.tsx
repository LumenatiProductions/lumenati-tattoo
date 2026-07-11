import LegacyBlock from "@/components/LegacyBlock";
import { notFound } from "next/navigation";
import { buildArcadePreviewHtml } from "@/lib/arcade-preview";

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
  const html = buildArcadePreviewHtml(game);
  if (!html) notFound();
  return <LegacyBlock html={html} />;
}
