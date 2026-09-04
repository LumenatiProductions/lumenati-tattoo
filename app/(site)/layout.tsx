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
  const signon = readLegacyBlock("aol-signon.html");
  const presence = readLegacyBlock("presence-y2k.html"); // "N online now": every page beats
  const shopbot = readLegacyBlock("shopbot-y2k.html"); // the AIM front desk, opened by Clippy
  const bundle = readLegacyBlock("code-injection-footer.html");
  const saver = readLegacyBlock("screensaver-y2k.html"); // idle a minute and the toasters fly
  const wallpaper = readLegacyBlock("wallpaper-y2k.html"); // Display Properties, remembered per browser
  return (
    <>
      {children}
      <LegacyBlock html={signon} />
      <LegacyBlock html={presence} />
      <LegacyBlock html={shopbot} />
      <LegacyBlock html={bundle} fireLoad />
      <LegacyBlock html={saver} />
      <LegacyBlock html={wallpaper} />
    </>
  );
}
