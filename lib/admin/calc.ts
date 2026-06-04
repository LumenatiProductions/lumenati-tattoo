import type { Artist, Sale, RentCharge } from "./types";

export const fmt = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export const fmtPrecise = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Per-artist settlement for a period. The cash/card split matters: card money
 * flows through Square into the shop's account (shop then owes the artist their
 * share), while cash is collected by the artist at the chair (the artist then
 * owes the shop its cut + rent). The net tells you who writes whom a check.
 */
export interface ArtistStatement {
  artist: Artist;
  saleCount: number;
  grossService: number;
  grossTips: number;
  cardService: number;
  cashService: number;
  cardTips: number;
  shopCut: number; // shop's % of all service (0 for pure rent)
  artistEarnings: number; // service kept by artist + all tips
  rentOwed: number; // unpaid rent this period
  shopOwesArtist: number; // artist share the shop is holding (from card)
  artistOwesShop: number; // shop cut on cash + unpaid rent
  net: number; // >0 shop pays artist, <0 artist pays shop
}

export function statementFor(
  artist: Artist,
  sales: Sale[],
  rent: RentCharge[],
): ArtistStatement {
  const mine = sales.filter((s) => s.artistId === artist.id);
  const split = artist.pay.shopSplitPct ?? 0;

  let grossService = 0,
    grossTips = 0,
    cardService = 0,
    cashService = 0,
    cardTips = 0;

  for (const s of mine) {
    grossService += s.serviceCents;
    grossTips += s.tipCents;
    if (s.method === "card") {
      cardService += s.serviceCents;
      cardTips += s.tipCents;
    } else {
      cashService += s.serviceCents;
    }
  }

  const shopCut = Math.round(grossService * split);
  const artistEarnings = grossService - shopCut + grossTips;

  const rentOwed = rent
    .filter((r) => r.artistId === artist.id && !r.paid)
    .reduce((a, r) => a + r.amountCents, 0);

  // Shop holds the card money -> owes the artist the artist-share of card sales.
  const shopOwesArtist = Math.round(cardService * (1 - split)) + cardTips;
  // Artist holds the cash -> owes the shop its cut of cash sales, plus rent.
  const artistOwesShop = Math.round(cashService * split) + rentOwed;

  return {
    artist,
    saleCount: mine.length,
    grossService,
    grossTips,
    cardService,
    cashService,
    cardTips,
    shopCut,
    artistEarnings,
    rentOwed,
    shopOwesArtist,
    artistOwesShop,
    net: shopOwesArtist - artistOwesShop,
  };
}

export interface ShopSummary {
  grossSales: number; // all service + tips through the shop
  serviceRevenue: number; // service only
  shopRevenue: number; // shop's take: splits + rent
  splitRevenue: number;
  rentRevenue: number;
  payoutsOwed: number; // sum of positive nets (shop -> artists)
  collectFromArtists: number; // sum of negative nets (artists -> shop)
  cardTotal: number;
  cashTotal: number;
}

export function shopSummary(
  artists: Artist[],
  sales: Sale[],
  rent: RentCharge[],
): ShopSummary {
  const statements = artists.map((a) => statementFor(a, sales, rent));
  const serviceRevenue = sales.reduce((a, s) => a + s.serviceCents, 0);
  const tips = sales.reduce((a, s) => a + s.tipCents, 0);
  const splitRevenue = statements.reduce((a, st) => a + st.shopCut, 0);
  const rentRevenue = rent.reduce((a, r) => a + r.amountCents, 0);
  const cardTotal = sales
    .filter((s) => s.method === "card")
    .reduce((a, s) => a + s.serviceCents + s.tipCents, 0);
  const cashTotal = sales
    .filter((s) => s.method === "cash")
    .reduce((a, s) => a + s.serviceCents + s.tipCents, 0);

  return {
    grossSales: serviceRevenue + tips,
    serviceRevenue,
    shopRevenue: splitRevenue + rentRevenue,
    splitRevenue,
    rentRevenue,
    payoutsOwed: statements.filter((s) => s.net > 0).reduce((a, s) => a + s.net, 0),
    collectFromArtists: statements
      .filter((s) => s.net < 0)
      .reduce((a, s) => a - s.net, 0),
    cardTotal,
    cashTotal,
  };
}

export function payTypeLabel(artist: Artist): string {
  const p = artist.pay;
  if (p.type === "rent") return `Booth rent · ${fmt(p.rentCents ?? 0)}/mo`;
  if (p.type === "split") return `${Math.round((p.shopSplitPct ?? 0) * 100)}% split`;
  return `Hybrid · ${fmt(p.rentCents ?? 0)}/mo + ${Math.round(
    (p.shopSplitPct ?? 0) * 100,
  )}%`;
}
