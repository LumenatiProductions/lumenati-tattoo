import { renterSplit } from "@/lib/money/renter";
import type { Artist, Sale } from "./types";

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
 * Per-artist statement for a period (2026-07-08 pay-model rebuild).
 * The shop cuts no checks and withholds nothing; the statement answers a
 * different question per pay type:
 *   - booth_rent:     how much of THEIR money the shop is holding (card sales
 *     collected on the shop reader — passed through 100%). Cash they collect
 *     themselves never touches the shop. Rent is billed separately, never here.
 *   - payroll_split:  the payroll-prep numbers — their share of service + all
 *     tips are the wages to type into Gusto this pay period.
 *   - payroll_salary: the owner. All of his sales are shop money; he has no
 *     statement (net stays 0 and he's filtered out of statement lists).
 */
export interface ArtistStatement {
  artist: Artist;
  saleCount: number;
  grossService: number;
  grossTips: number;
  cardService: number;
  cardTips: number;
  cashService: number;
  cashTips: number;
  shopCut: number; // shop's share of service (split); all svc+tips for salary; 0 for renters
  artistEarnings: number; // renter: everything; split: wages basis; salary: 0
  passThroughOwed: number; // booth_rent only: card svc + tips the shop is holding
  gustoWages: number; // payroll_split only: wages to enter into Gusto
  contractorOwed: number; // contractor_split only: pay the contractor directly (1099)
  net: number; // what clears when the row is settled (pass-through or Gusto entry)
}

export function statementFor(artist: Artist, sales: Sale[]): ArtistStatement {
  const mine = sales.filter((s) => s.artistId === artist.id);
  const type = artist.pay.type;
  const isSplit = type === "payroll_split" || type === "contractor_split";
  const split = isSplit ? (artist.pay.shopSplitPct ?? 0) : 0;

  let grossService = 0,
    grossTips = 0,
    cardService = 0,
    cardTips = 0,
    cashService = 0,
    cashTips = 0,
    // Rounded PER SALE, not on the summed service — the P&L rounds each
    // ticket's cut, and per-sale rounding is the only scheme where every
    // grouping (statement range, P&L month/quarter/year) lands on the same
    // penny.
    splitCut = 0;

  for (const s of mine) {
    grossService += s.serviceCents;
    grossTips += s.tipCents;
    if (isSplit) splitCut += Math.round(s.serviceCents * split);
    if (s.method === "card") {
      cardService += s.serviceCents;
      cardTips += s.tipCents;
    } else {
      cashService += s.serviceCents;
      cashTips += s.tipCents;
    }
  }

  let shopCut = 0;
  let artistEarnings = 0;
  let passThroughOwed = 0;
  let gustoWages = 0;
  let contractorOwed = 0;

  if (type === "booth_rent") {
    // Their money, all of it. The shop only holds what its reader collected
    // (lib/money/renter.ts is the one definition every surface shares).
    artistEarnings = grossService + grossTips;
    passThroughOwed = renterSplit(cardService + cardTips, false).passThrough;
  } else if (isSplit) {
    // Same math either way: the shop keeps its cut, the artist's share goes out.
    // The DIFFERENCE is how it goes out — payroll_split becomes W-2 wages via
    // Gusto; contractor_split is paid straight to a contractor (1099 at $600+),
    // so it must never land in the Gusto column.
    shopCut = splitCut;
    artistEarnings = grossService - shopCut + grossTips;
    if (type === "payroll_split") gustoWages = artistEarnings;
    else contractorOwed = artistEarnings;
  } else {
    // payroll_salary: the owner — his tickets are shop revenue, he's paid a
    // salary in Gusto, and nothing is ever owed either way in the app.
    shopCut = grossService + grossTips;
  }

  return {
    artist,
    saleCount: mine.length,
    grossService,
    grossTips,
    cardService,
    cardTips,
    cashService,
    cashTips,
    shopCut,
    artistEarnings,
    passThroughOwed,
    gustoWages,
    contractorOwed,
    net: passThroughOwed + gustoWages + contractorOwed,
  };
}

export interface ShopSummary {
  grossSales: number; // all service + tips through the shop
  serviceRevenue: number; // service only
  splitRevenue: number; // shop's take from tickets: split cuts + owner's sales
  renterPassThrough: number; // renters' card sales — moves through, never income
  gustoWagesDue: number; // wages to enter into Gusto for payroll-split artists
  contractorsDue: number; // owed to split CONTRACTORS, paid direct (1099)
  cardTotal: number;
  cashTotal: number;
}

export function shopSummary(artists: Artist[], sales: Sale[]): ShopSummary {
  const statements = artists.map((a) => statementFor(a, sales));
  const serviceRevenue = sales.reduce((a, s) => a + s.serviceCents, 0);
  const tips = sales.reduce((a, s) => a + s.tipCents, 0);
  const splitRevenue = statements.reduce((a, st) => a + st.shopCut, 0);
  const cardTotal = sales
    .filter((s) => s.method === "card")
    .reduce((a, s) => a + s.serviceCents + s.tipCents, 0);
  const cashTotal = sales
    .filter((s) => s.method === "cash")
    .reduce((a, s) => a + s.serviceCents + s.tipCents, 0);

  return {
    grossSales: serviceRevenue + tips,
    serviceRevenue,
    splitRevenue,
    renterPassThrough: statements.reduce((a, st) => a + st.passThroughOwed, 0),
    gustoWagesDue: statements.reduce((a, st) => a + st.gustoWages, 0),
    contractorsDue: statements.reduce((a, st) => a + st.contractorOwed, 0),
    cardTotal,
    cashTotal,
  };
}

export function payTypeLabel(artist: Artist): string {
  const p = artist.pay;
  if (p.type === "booth_rent") return `Booth rent · ${fmt(p.rentCents ?? 0)}/mo`;
  if (p.type === "payroll_split")
    return `${Math.round((p.shopSplitPct ?? 0) * 100)}% split · Gusto payroll`;
  if (p.type === "contractor_split")
    return `${Math.round((p.shopSplitPct ?? 0) * 100)}% split · contractor (1099)`;
  return "Owner salary · Gusto";
}
