import type { Artist, Sale, CashLogEntry, RentCharge } from "./types";

// Deterministic data so the dashboard is stable across builds. Real numbers
// come from Square (sales/tips) + the cash log once connected; this stands in
// until then. NOTE: this is clearly fake seed data, not real shop figures.

// ── The crew, with their (varied) pay arrangements ──
export const ARTISTS: Artist[] = [
  {
    id: "jd",
    name: "J.D. Pruitt",
    handle: "jd.pruitt",
    color: "#FF1493",
    active: true,
    pay: { type: "split", shopSplitPct: 0.35 },
    squareTeamMemberId: null,
  },
  {
    id: "elaine",
    name: "Electric Elaine",
    handle: "electric.elaine",
    color: "#FFD700",
    active: true,
    pay: { type: "rent", rentCents: 120000 },
    squareTeamMemberId: null,
  },
  {
    id: "shorty",
    name: "ShorTy",
    handle: "shorty.tattoo",
    color: "#7FFF00",
    active: true,
    pay: { type: "hybrid", rentCents: 60000, shopSplitPct: 0.15 },
    squareTeamMemberId: null,
  },
  {
    id: "kalypso",
    name: "King Kalypso",
    handle: "king.kalypso",
    color: "#1493FF",
    active: true,
    pay: { type: "split", shopSplitPct: 0.3 },
    squareTeamMemberId: null,
  },
  {
    id: "sam",
    name: "Sam Durbin-Clark",
    handle: "sam.durbinclark",
    color: "#9b59b6",
    active: true,
    pay: { type: "rent", rentCents: 100000 },
    squareTeamMemberId: null,
  },
  {
    id: "moonie",
    name: "Moonie B. Jones",
    handle: "moonie.b.jones",
    color: "#FF6347",
    active: true,
    guest: true,
    pay: { type: "split", shopSplitPct: 0.4 },
    squareTeamMemberId: null,
  },
];

// Seeded LCG -> stable pseudo-random.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const SERVICES = [
  "Custom color piece",
  "Black & grey",
  "Flash — wall pick",
  "Touch-up",
  "Fine line",
  "Cover-up session",
  "Lettering",
  "Walk-in",
];

function dayStr(monthDay: number): string {
  // monthDay 1..65 maps across May (1-31) and June (32+) 2026.
  if (monthDay <= 31) return `2026-05-${String(monthDay).padStart(2, "0")}`;
  return `2026-06-${String(monthDay - 31).padStart(2, "0")}`;
}

// Per-artist sales volume profile (busy vs quieter).
const VOLUME: Record<string, number> = {
  jd: 18,
  elaine: 12,
  shorty: 14,
  kalypso: 16,
  sam: 9,
  moonie: 7,
};

function buildSales(): Sale[] {
  const out: Sale[] = [];
  let n = 0;
  for (const a of ARTISTS) {
    const rand = lcg(a.id.split("").reduce((x, c) => x + c.charCodeAt(0), 7));
    const count = VOLUME[a.id] ?? 10;
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(rand() * 34); // through ~Jun 3
      const service = 12000 + Math.floor(rand() * 48000); // $120–$600
      const tip = Math.floor(service * (0.1 + rand() * 0.15)); // 10–25%
      const isCash = rand() < 0.32; // ~a third cash, matches Scott
      out.push({
        id: `s${String(++n).padStart(4, "0")}`,
        artistId: a.id,
        date: dayStr(day),
        serviceCents: Math.round(service / 500) * 500,
        tipCents: Math.round(tip / 500) * 500,
        method: isCash ? "cash" : "card",
        squarePaymentId: isCash ? null : `sq_${n}_${a.id}`,
        description: SERVICES[Math.floor(rand() * SERVICES.length)],
      });
    }
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : -1));
}

export const SALES: Sale[] = buildSales();

// Cash log — drawer entries the front desk records; some not yet reconciled.
export const CASH_LOG: CashLogEntry[] = SALES.filter((s) => s.method === "cash")
  .slice(0, 14)
  .map((s, i) => ({
    id: `c${String(i + 1).padStart(3, "0")}`,
    date: s.date,
    artistId: s.artistId,
    amountCents: s.serviceCents + s.tipCents,
    note: `${s.description} (cash)`,
    reconciled: i % 3 !== 0, // ~1/3 outstanding
    enteredBy: i % 2 === 0 ? "Front desk — Riley" : "Front desk — Dev",
  }));

// Rent charges for the current period (rent + hybrid artists only).
export const RENT_CHARGES: RentCharge[] = ARTISTS.filter(
  (a) => a.pay.type === "rent" || a.pay.type === "hybrid",
).map((a, i) => ({
  id: `r${i + 1}`,
  artistId: a.id,
  periodLabel: "Jun 2026",
  amountCents: a.pay.rentCents ?? 0,
  dueDate: "2026-06-05",
  paid: a.id === "sam", // Sam's paid; others outstanding
}));
