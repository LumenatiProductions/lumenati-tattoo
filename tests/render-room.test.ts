import { describe, expect, it } from "vitest";
import { GAME_CATALOG, renderRoomHtml } from "@/lib/admin/render-room";
import { buildArcadePreviewHtml } from "@/lib/arcade-preview";
import type { RoomContent } from "@/lib/admin/types";

// The renderer templates JD's real room, so these assertions run against the
// actual legacy HTML (already asset-rewritten by readLegacyBlock).

const room = (over: Partial<RoomContent>): RoomContent => ({
  artistId: "test",
  tagline: "tag // line",
  bio: "a bio",
  igHandle: "test.handle",
  songId: "offspring",
  accentColor: "#FFD700",
  profilePhoto: "/legacy-assets/sqsp-000.jpg",
  polaroids: [],
  portfolio: [],
  stickers: null,
  posters: null,
  socials: null,
  videoUrl: null,
  videoTitle: null,
  tvVideoId: null,
    layout: null,
  ...over,
});

describe("the cabinet + video", () => {
  it("every room ships the full cabinet: selector script, arcade window, catalog payload", () => {
    const html = renderRoomHtml(room({}), "Test Artist", false);
    expect(html).toContain('<script id="jd-arcade-game" src="/arcade-selector.js">');
    expect(html).toContain("arcade.exe — Test's Arcade");
    expect(html).toContain('id="jd-game-overlay"');
    expect(html).toContain('id="jd-games-icon"');
    expect(html).toContain('id="jd-mob-game"');
    expect(html).toContain("window.__ARCADE_GAMES__=");
    expect(html).toContain('window.__ARCADE_ARTIST__="test"');
    expect(html).toContain('window.__ARCADE_ACCENT__="#FFD700"');
    for (const g of GAME_CATALOG) {
      expect(html, g.id).toContain(g.label);
      expect(html, g.id).toContain(g.exe);
    }
  });

  it("closed books swap every Book CTA for the waitlist door", () => {
    const open = renderRoomHtml(room({}), "Test Artist", false);
    const closed = renderRoomHtml(room({}), "Test Artist", false, { booksClosed: true });
    expect(open).toContain('href="/book"');
    expect(open).not.toContain("Waitlist");
    expect(closed).not.toContain('href="/book"');
    expect(closed).toContain('href="/request?artist=test"');
    expect((closed.match(/>Waitlist</g) ?? []).length).toBe(3);
  });

  it("socials render as desktop icons, mobile buttons, and buddy-info links", () => {
    const html = renderRoomHtml(
      room({ socials: { tiktok: "@inky", x: "inky", website: "inky.ink" } }),
      "Test Artist",
      false,
    );
    expect(html).toContain('href="https://www.tiktok.com/@inky"');
    expect(html).toContain('href="https://x.com/inky"');
    expect(html).toContain('href="https://inky.ink"');
    expect(html).toContain('<span class="br-icon-label">TikTok</span>');
    expect(html).toContain('<span class="br-icon-label">Website</span>');
    expect((html.match(/bedroom-mobile-btn/g) ?? []).length).toBeGreaterThanOrEqual(5);
    const none = renderRoomHtml(room({}), "Test Artist", false);
    expect(none).not.toContain("TikTok");
  });

  it("a connected instagram wins over the legacy handle field", () => {
    const html = renderRoomHtml(
      room({ igHandle: "old.handle", socials: { instagram: "@new.handle" } }),
      "Test Artist",
      false,
    );
    expect(html).toContain("https://www.instagram.com/new.handle/");
    expect(html).not.toContain("old.handle");
  });

  it("JD keeps his Vimeo clip; his cabinet reads as his arcade", () => {
    const html = renderRoomHtml(room({ artistId: "jd", igHandle: "jd.pruitt" }), "J.D. Pruitt", true);
    expect(html).toContain("arcade.exe — JD's Arcade");
    expect(html).toContain('id="jd-vimeo"');
    expect(html).toContain("jd_skate_edit.avi");
    expect(html).toContain('id="jd-skate-icon"');
    expect(html).toContain('id="jd-mob-skate"');
  });

  it("no video means no video window, but the cabinet stays", () => {
    const html = renderRoomHtml(room({}), "Test Artist", false);
    expect(html).not.toContain('id="jd-vimeo"');
    expect(html).not.toContain('id="jd-video-overlay"');
    expect(html).not.toContain('id="jd-skate-icon"');
    expect(html).not.toContain('id="jd-mob-skate"');
    expect(html).toContain('id="jd-games-icon"');
  });

  it("an uploaded video swaps the Vimeo iframe for a <video> in the same WMP chrome", () => {
    const url = "https://example.supabase.co/storage/room-photos/test/video-1.mp4";
    const html = renderRoomHtml(room({ videoUrl: url }), "Test Artist", false);
    expect(html).toContain('<video id="jd-room-video"');
    expect(html).toContain(`src="${url}"`);
    expect(html).not.toContain('id="jd-vimeo"');
    expect(html).toContain("Windows Media Player — test_handle_edit.avi");
    expect(html).toContain('<span class="br-icon-label">Video</span>');
    expect(html).toContain('id="jd-mob-skate">Video</a>');
  });

  it("a video title becomes the media player filename", () => {
    const url = "https://example.supabase.co/storage/room-photos/test/video-1.mp4";
    const html = renderRoomHtml(
      room({ videoUrl: url, videoTitle: "My Shop Tour!" }),
      "Test Artist",
      false,
    );
    expect(html).toContain("Windows Media Player — my_shop_tour.avi");
    expect(html).toContain("Playing - my_shop_tour.avi");
  });

  it("JD's own upload replaces his Vimeo default but keeps his Skate labels", () => {
    const url = "https://example.supabase.co/storage/room-photos/jd/video-1.mp4";
    const html = renderRoomHtml(room({ artistId: "jd", igHandle: "jd.pruitt", videoUrl: url }), "J.D. Pruitt", true);
    expect(html).toContain('<video id="jd-room-video"');
    expect(html).not.toContain('id="jd-vimeo"');
    expect(html).toContain('<span class="br-icon-label">Skate</span>');
  });
});

describe("the /arcade cartridges", () => {
  it("every game builds a playable /arcade preview", () => {
    for (const g of GAME_CATALOG) {
      const html = buildArcadePreviewHtml(g.id);
      expect(html, g.id).toBeTruthy();
      expect(html, g.id).toContain('id="jd-skate-canvas"');
      expect(html, g.id).toContain('<script id="jd-arcade-game">');
      expect(html, g.id).toContain(g.exe);
    }
    expect(buildArcadePreviewHtml("doom")).toBeNull();
  });

  it("every game builds an embed cartridge: bare shell, no switcher, tagged for the cabinet script", () => {
    for (const g of GAME_CATALOG) {
      const html = buildArcadePreviewHtml(g.id, { embed: true });
      expect(html, g.id).toBeTruthy();
      expect(html, g.id).toContain(`window.__ARCADE_EMBED__="${g.id}"`);
      expect(html, g.id).toContain('id="jd-skate-canvas"');
      expect(html, g.id).toContain('<script id="jd-arcade-game">');
      expect(html, g.id).toContain("/arcade-cabinet.js");
      expect(html, g.id).not.toContain("Try the Arcade");
    }
  });

  it("pong's embed relabels the status bar to You/CPU", () => {
    const html = buildArcadePreviewHtml("pong", { embed: true })!;
    expect(html).toContain('<span id="jd-stat-a">You</span>');
    expect(html).toContain('<span id="jd-stat-b">CPU</span>');
    expect(html).toContain('<span id="jd-br-lives">0</span>');
  });

  it("flash match's embed carries the artist's flash wall; other games do not", () => {
    const html = buildArcadePreviewHtml("flashmatch", {
      embed: true,
      flashSrcs: ["https://example.supabase.co/storage/flash/a.png", "/legacy-assets/sqsp-003.jpg"],
    })!;
    expect(html).toContain("window.__ROOM_FLASH__=");
    expect(html).toContain("https://example.supabase.co/storage/flash/a.png");
    const other = buildArcadePreviewHtml("snake", { embed: true, flashSrcs: ["https://x/y.png"] })!;
    expect(other).not.toContain("window.__ROOM_FLASH__");
  });
});
