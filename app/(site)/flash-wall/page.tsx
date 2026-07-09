import LegacyBlock from "@/components/LegacyBlock";
import { readLegacyBlock } from "@/lib/legacy";
import { getSupabase } from "@/lib/supabase";

// The flash wall (page-walk item 5): artists pin flash from the app and the
// corkboard renders the real pieces. With nothing pinned yet the template's
// placeholder cards stay up, so the page never looks broken.
export const revalidate = 120;

type Piece = {
  src: string;
  title: string;
  price_cents: number;
  status: string;
  artists: { name: string } | null;
};

export default async function FlashWallPage() {
  let html = readLegacyBlock("flash-wall-y2k.html");

  try {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from("flash_pieces")
        .select("src, title, price_cents, status, artists(name)")
        .order("created_at", { ascending: false })
        .limit(60);
      const pieces = (data ?? []) as unknown as Piece[];
      if (pieces.length) {
        const cards = pieces.map((p, i) => ({
          id: String(i + 1).padStart(2, "0"),
          src: p.src,
          title: p.title,
          artist: p.artists?.name ?? "",
          price: p.price_cents > 0 ? `$${Math.round(p.price_cents / 100)}` : "ask",
          status: p.status === "claimed" ? "claimed" : "available",
        }));
        html = html.replace(/var cards = \[[\s\S]*?\];/, `var cards = ${JSON.stringify(cards)};`);
        // Real pieces render the actual drawing (object-fit cover), keeping the
        // placeholder color-block path for cards without an image.
        html = html.replace(
          "'<div class=\"flash-img\" style=\"background:' + card.color + ';\">FLASH #' + card.id + '</div>' +",
          "(card.src ? '<div class=\"flash-img\" style=\"padding:0;overflow:hidden;\"><img src=\"' + card.src + '\" alt=\"' + (card.title || 'flash') + '\" loading=\"lazy\" style=\"width:100%;height:100%;object-fit:cover;display:block;\"></div>' : '<div class=\"flash-img\" style=\"background:' + card.color + ';\">FLASH #' + card.id + '</div>') +",
        );
        // Artist credit under the price when we know it.
        html = html.replace(
          "'<div class=\"flash-price\">' + card.price + '</div>' +",
          "'<div class=\"flash-price\">' + card.price + (card.artist ? ' · ' + card.artist : '') + '</div>' +",
        );
      }
    }
  } catch {
    /* wall falls back to placeholders */
  }

  return <LegacyBlock html={html} />;
}
