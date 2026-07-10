import LegacyBlock from "@/components/LegacyBlock";
import { notFound } from "next/navigation";
import { buildArcadePreviewHtml } from "@/lib/arcade-preview";

// Try-before-you-pick: every arcade game playable at /arcade/<id>. The app's
// game chooser links here so artists can decide with their thumbs.
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
