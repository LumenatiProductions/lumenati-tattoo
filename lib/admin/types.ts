// ── Lumenati command center: core domain types ──
// Money is always integer cents to avoid float drift.

export type Role = "owner" | "bookkeeper" | "artist" | "frontdesk";

export type PayType = "rent" | "split" | "hybrid";

/**
 * How an artist pays the shop. This varies per artist (Scott: some flat booth
 * rent, some % split, some hybrid).
 *   - rent:   flat booth rent per period; shop takes 0% of tickets.
 *   - split:  shop keeps `shopSplitPct` of each ticket; no rent.
 *   - hybrid: a (smaller) rent AND a (smaller) split.
 */
export interface PayArrangement {
  type: PayType;
  /** Monthly booth rent in cents (rent + hybrid). */
  rentCents?: number;
  /** Shop's cut of each ticket, 0..1 (split + hybrid). */
  shopSplitPct?: number;
}

export interface Artist {
  id: string;
  name: string;
  handle: string; // instagram, matches public site
  color: string; // their Y2K room accent
  active: boolean;
  guest?: boolean;
  pay: PayArrangement;
  /** Linked Square team-member id, once Square is connected (null = unlinked). */
  squareTeamMemberId: string | null;
}

export type PaymentMethod = "card" | "cash";

/**
 * A completed ticket. In production these are READ from Square (Scott: Square
 * stays the POS). `squarePaymentId` is the source row; cash tickets are logged
 * by the front desk and have no Square id.
 */
export interface Sale {
  id: string;
  artistId: string;
  date: string; // ISO yyyy-mm-dd
  serviceCents: number; // the tattoo/service amount
  tipCents: number;
  method: PaymentMethod;
  squarePaymentId: string | null;
  description: string;
}

/** Cash that came in the door and still needs reconciling against the drawer. */
export interface CashLogEntry {
  id: string;
  date: string;
  artistId: string | null; // null = shop (retail, deposits)
  amountCents: number;
  note: string;
  reconciled: boolean;
  enteredBy: string; // front-desk name
}

/** A rent charge owed by an artist for a period (rent + hybrid arrangements). */
export interface RentCharge {
  id: string;
  artistId: string;
  periodLabel: string; // e.g. "Jun 2026"
  amountCents: number;
  dueDate: string;
  paid: boolean;
}

// ── Artist-editable room content ──
// The Y2K "bedroom" pages render from this so artists can manage their own
// room from the command center. `src` values are image URLs (local
// /legacy-assets today; Supabase Storage once uploads are wired).

export interface Polaroid {
  id: string;
  src: string;
  caption: string;
}

export interface PortfolioItem {
  id: string;
  src: string;
  alt: string;
}

export interface RoomContent {
  artistId: string;
  tagline: string; // "skater // gamer // bold color tattoos"
  bio: string; // the buddy-info blurb
  igHandle: string; // without the @
  songId: string; // see SONGS in room-content.tsx
  accentColor: string; // hex; their room accent
  profilePhoto: string; // src
  polaroids: Polaroid[];
  portfolio: PortfolioItem[];
}
