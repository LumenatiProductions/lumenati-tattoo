import { describe, expect, it } from "vitest";
import { GAME_CATALOG, renderRoomHtml } from "@/lib/admin/render-room";
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
  gameId: null,
  videoUrl: null,
  videoTitle: null,
  ...over,
});

describe("arcade + video picks", () => {
  it("JD with NULL picks keeps his baked-in skate game and Vimeo clip", () => {
    const html = renderRoomHtml(room({ artistId: "jd", igHandle: "jd.pruitt" }), "J.D. Pruitt", true);
    expect(html).toContain('<script id="jd-arcade-game">');
    expect(html).toContain("INK OR DIE");
    expect(html).toContain("ink_or_die.exe — JD's Arcade");
    expect(html).toContain('id="jd-vimeo"');
    expect(html).toContain("jd_skate_edit.avi");
    expect(html).toContain('id="jd-games-icon"');
    expect(html).toContain('id="jd-skate-icon"');
    expect(html).toContain('id="jd-mob-game"');
    expect(html).toContain('id="jd-mob-skate"');
  });

  it("another artist with NULL picks gets neither window", () => {
    const html = renderRoomHtml(room({}), "Test Artist", false);
    expect(html).not.toContain('<script id="jd-arcade-game">');
    expect(html).not.toContain('id="jd-vimeo"');
    expect(html).not.toContain('id="jd-game-overlay"');
    expect(html).not.toContain('id="jd-video-overlay"');
    expect(html).not.toContain('id="jd-games-icon"');
    expect(html).not.toContain('id="jd-skate-icon"');
    expect(html).not.toContain('id="jd-mob-game"');
    expect(html).not.toContain('id="jd-mob-skate"');
  });

  it("a picked game swaps the IIFE, exe title and hint into the shell", () => {
    const html = renderRoomHtml(room({ gameId: "snake" }), "Test Artist", false);
    expect(html).toContain('<script id="jd-arcade-game">');
    expect(html).toContain("INK SNAKE");
    expect(html).not.toContain("INK OR DIE");
    expect(html).toContain("inksnake.exe — Test's Arcade");
    expect(html).toContain('<span id="jd-game-hint">Arrows or swipe to steer // machine +50</span>');
    expect(html).toContain('id="jd-games-icon"');
    expect(html).toContain('id="jd-mob-game"');
    // No video picked: the video window stays gone
    expect(html).not.toContain('id="jd-video-overlay"');
    expect(html).not.toContain('id="jd-mob-skate"');
  });

  it("every catalog game renders into the shell", () => {
    for (const g of GAME_CATALOG) {
      const html = renderRoomHtml(room({ gameId: g.id }), "Test Artist", false);
      expect(html, g.id).toContain('<script id="jd-arcade-game">');
      expect(html, g.id).toContain(`${g.exe} — Test's Arcade`);
      expect(html, g.id).toContain(`<span id="jd-game-hint">${g.hint}</span>`);
    }
  });

  it("pong relabels the status bar to You/CPU", () => {
    const html = renderRoomHtml(room({ gameId: "pong" }), "Test Artist", false);
    expect(html).toContain('<span id="jd-stat-a">You</span>');
    expect(html).toContain('<span id="jd-stat-b">CPU</span>');
    expect(html).toContain('<span id="jd-br-lives">0</span>');
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
    // No game picked: the arcade stays gone
    expect(html).not.toContain('<script id="jd-arcade-game">');
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

  it("flash match gets the artist's flash wall handed into the page", () => {
    const html = renderRoomHtml(room({ gameId: "flashmatch" }), "Test Artist", false, [
      "https://example.supabase.co/storage/flash/a.png",
      "/legacy-assets/sqsp-003.jpg",
    ]);
    expect(html).toContain("window.__ROOM_FLASH__=");
    expect(html).toContain("https://example.supabase.co/storage/flash/a.png");
    // Other games do not carry the flash payload
    const other = renderRoomHtml(room({ gameId: "snake" }), "Test Artist", false, ["https://x/y.png"]);
    expect(other).not.toContain("window.__ROOM_FLASH__");
  });

  it("an unknown game id falls back to NULL behavior", () => {
    const html = renderRoomHtml(room({ gameId: "doom" }), "Test Artist", false);
    expect(html).not.toContain('<script id="jd-arcade-game">');
    expect(html).not.toContain('id="jd-games-icon"');
  });

  it("game and video picks work together", () => {
    const url = "https://example.supabase.co/storage/room-photos/test/video-1.mp4";
    const html = renderRoomHtml(room({ gameId: "frogger", videoUrl: url }), "Test Artist", false);
    expect(html).toContain("WALK-IN");
    expect(html).toContain('<video id="jd-room-video"');
    expect(html).toContain('id="jd-games-icon"');
    expect(html).toContain('id="jd-mob-game"');
    expect(html).toContain('id="jd-mob-skate"');
  });
});
