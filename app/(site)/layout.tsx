import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";

// Squarespace ran the "code injection footer" bundle (Winamp, Clippy, AOL
// dial-up intro, VHS transitions, Konami code) on every page. Internal links in
// the legacy markup are plain <a href>, so each navigation is a full document
// load and this layout re-runs the bundle fresh — which preserves per-room
// Winamp tracks. The intro/clippy gate themselves via sessionStorage.
//
// Living in the (site) route group keeps the bundle off the future /admin
// command center, which renders outside this group.
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bundle = readLegacyBlock("code-injection-footer.html");
  return (
    <>
      {children}
      <LegacyBlock html={bundle} fireLoad />
    </>
  );
}
