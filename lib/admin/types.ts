// ── Lumenati command center: core domain types ──
// Money is always integer cents to avoid float drift.

// Two roles, period (2026-07-09 artist-driven audit): Admin runs the shop,
// Artist runs their chair. The stored admin value stays 'owner' so RLS and
// gates keep their string; retired values (bookkeeper/frontdesk) normalize
// to admin at the auth boundary and can no longer be assigned.
export type Role = "owner" | "artist";

export const normalizeRole = (raw: string | null | undefined): Role =>
  raw === "artist" ? "artist" : raw === "owner" || raw === "bookkeeper" || raw === "frontdesk" ? "owner" : "artist";

export type PayType = "payroll_salary" | "payroll_split" | "booth_rent" | "contractor_split";

/**
 * How an artist is paid (2026-07-08 rebuild — see PAGE-WALK-NOTES 2/11/15).
 * The shop never cuts checks through the app and withholds nothing:
 *   - payroll_salary: the owner (J.D.). Salaried via Gusto; his tickets are
 *     all shop money and he never appears in statements.
 *   - payroll_split:  shop keeps `shopSplitPct` of service; the artist's share
 *     + tips are WAGES paid via Gusto — the app only produces the
 *     payroll-prep numbers to type in each pay period.
 *   - booth_rent:     the artist's money, 100%. Card sales collected on the
 *     shop's reader are held and passed through in full; rent is billed
 *     separately (monthly invoice) and NEVER netted against their sales.
 */
export interface PayArrangement {
  type: PayType;
  /** Monthly booth rent in cents (booth_rent only). */
  rentCents?: number;
  /** Shop's cut of each ticket, 0..1 (payroll_split only). */
  shopSplitPct?: number;
}

export interface Artist {
  id: string;
  slug: string; // public room URL: /<slug>
  name: string;
  handle: string; // instagram, matches public site
  color: string; // their Y2K room accent
  active: boolean;
  guest?: boolean;
  roomExtras?: boolean; // JD's skate game/video
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

/** A rent charge owed by a booth renter for a period. Billed on its own — it
 * never enters a statement or nets against the artist's sales. */
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
  /** Chosen sticker catalog ids; null = not chosen yet (room keeps its baked-in set). */
  stickers: string[] | null;
  /** The artist's own wall posters; null = not chosen yet. */
  posters: { id: string; src: string }[] | null;
  /** Arcade game id (see GAME_CATALOG in render-room.ts); null = JD keeps skate, others have none. */
  /** The artist's uploaded room video; null = JD keeps his Vimeo clip, others have none. */
  videoUrl: string | null;
  /** { instagram, tiktok, x, youtube, facebook, website } — handles or URLs. */
  socials: Record<string, string> | null;
  /** Title for the room video; becomes the media player window's filename. */
  videoTitle: string | null;
  /** YouTube id of the artist's music video pick from the shop TV lineup; null = no MTV icon. */
  tvVideoId: string | null;
}
