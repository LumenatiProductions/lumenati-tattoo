"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RoleProvider, useRole, ROLE_LABELS, ASSIGNABLE_ROLES } from "@/lib/admin/role-context";
import { RoomContentProvider } from "@/lib/admin/room-content";
import { SalesProvider } from "@/lib/admin/sales-context";
import { RentProvider } from "@/lib/admin/rent-context";
import { SocialProvider } from "@/lib/admin/social-context";
import { ClientsProvider } from "@/lib/admin/clients-context";
import { BookingsProvider } from "@/lib/admin/bookings-context";
import { IntakeProvider } from "@/lib/admin/intake-context";
import { ComplianceProvider } from "@/lib/admin/compliance-context";
import { InventoryProvider } from "@/lib/admin/inventory-context";
import { FollowupsProvider } from "@/lib/admin/followups-context";
import { CashProvider } from "@/lib/admin/cash-context";
import { ArtistsProvider, useArtists } from "@/lib/admin/artists-context";
import { createClient } from "@/lib/supabase/browser";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import BugReporter from "@/components/BugReporter";
import type { Role } from "@/lib/admin/types";
import { NavIcon, type NavIconName } from "@/components/admin/NavIcon";

type NavItem = { href: string; label: string; roles: Role[]; icon: NavIconName; soon?: boolean };
// Sections render as small headers in the sidebar; a header only appears when
// the current role can see at least one page inside it. The title-less top
// section renders full-width rows; titled sections pack two-across to keep the
// rail short. An artist's own page lives up top as "My Page"; for shop
// accounts the same screen is "Artist pages", filed under Shop.
const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Overview", roles: ["owner", "artist"], icon: "overview" },
      { href: "/admin/room", label: "My Page", roles: ["artist"], icon: "mypage" },
    ],
  },
  {
    title: "Front of house",
    items: [
      { href: "/admin/bookings", label: "Bookings", roles: ["owner", "artist"], icon: "bookings" },
      { href: "/admin/waitlist", label: "Waitlist", roles: ["artist"], icon: "waitlist" },
      { href: "/admin/clients", label: "Clients", roles: ["owner"], icon: "clients" },
      { href: "/admin/my-clients", label: "Clients", roles: ["artist"], icon: "clients" },
      { href: "/admin/intake", label: "Intake", roles: ["owner"], icon: "intake" },
      { href: "/admin/followups", label: "Follow-ups", roles: ["owner"], icon: "followups" },
      { href: "/admin/my-followups", label: "Follow-ups", roles: ["artist"], icon: "followups" },
      { href: "/admin/healed", label: "Healed Shots", roles: ["artist"], icon: "healed" },
      { href: "/admin/qr", label: "QR Card", roles: ["artist"], icon: "qr" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/admin/marketing", label: "Blasts", roles: ["owner"], icon: "blasts" },
      { href: "/admin/social", label: "Social", roles: ["owner"], icon: "social" },
      { href: "/admin/sending", label: "Sending", roles: ["owner"], icon: "sending" },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/admin/pnl", label: "Profit & Loss", roles: ["owner"], icon: "pnl" },
      { href: "/admin/reports", label: "Reports", roles: ["owner"], icon: "reports" },
      { href: "/admin/payouts", label: "Pay", roles: ["owner", "artist"], icon: "pay" },
      { href: "/admin/goals", label: "Goals", roles: ["artist"], icon: "goals" },
      { href: "/admin/rent", label: "Booth Rent", roles: ["owner"], icon: "rent" },
      { href: "/admin/cash", label: "Cash Log", roles: ["owner"], icon: "cash" },
      { href: "/admin/expenses", label: "Expenses", roles: ["owner"], icon: "expenses" },
      { href: "/admin/reconcile", label: "Reconcile", roles: ["owner"], icon: "reconcile" },
    ],
  },
  {
    title: "Shop",
    items: [
      { href: "/admin/artists", label: "Artists & Pay", roles: ["owner"], icon: "artists" },
      { href: "/admin/room", label: "Artist pages", roles: ["owner"], icon: "artistpages" },
      { href: "/admin/inventory", label: "Inventory", roles: ["owner"], icon: "inventory" },
      { href: "/admin/compliance", label: "Compliance", roles: ["owner"], icon: "compliance" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/staff", label: "Staff", roles: ["owner"], icon: "staff" },
      { href: "/admin/integrations", label: "Integrations", roles: ["owner"], icon: "integrations" },
      { href: "/admin/billing", label: "Billing", roles: ["owner"], icon: "billing" },
    ],
  },
];

// Category glyphs for the slim rail.
const CAT_ICONS: Record<string, NavIconName> = {
  "Front of house": "foh",
  Marketing: "marketingcat",
  Finances: "finances",
  Shop: "shopcat",
  Admin: "admincat",
};

// Membership state, resolved server-side in the layout (billing columns are
// server-only). locked = trial over + no live subscription -> the shell shows
// only the Billing page.
export type BillingShellState = { locked: boolean; trialDaysLeft: number | null };

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role, setRole, asArtistId, setAsArtistId, canPreview, email } = useRole();
  const { artists } = useArtists();
  const pathname = usePathname();
  const router = useRouter();

  // Previewing as an artist without a chosen chair left asArtistId empty, so
  // every artist-scoped page (Overview, Goals, My Page) resolved no artist and
  // rendered blank. Default to the first artist the moment the pick is invalid.
  useEffect(() => {
    if (role === "artist" && artists.length && !artists.some((a) => a.id === asArtistId)) {
      setAsArtistId(artists[0].id);
    }
  }, [role, artists, asArtistId, setAsArtistId]);
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((n) => n.roles.includes(role)),
  })).filter((s) => s.items.length > 0);

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // Two-rail nav: the slim left rail holds Overview (and an artist's My Page)
  // plus one button per category; picking a category pulls out the second rail
  // with that category's pages. The open category follows the page you're on.
  const topItems = sections.find((s) => s.title === null)?.items ?? [];
  const catSections = sections.filter((s) => s.title !== null);
  const currentCat =
    catSections.find((s) => s.items.some((n) => pathname === n.href))?.title ?? null;
  const [openCat, setOpenCat] = useState<string | null>(null);
  useEffect(() => {
    if (currentCat) setOpenCat(currentCat);
  }, [currentCat]);
  const open =
    catSections.find((s) => s.title === openCat) ?? catSections[0] ?? null;

  return (
    <aside className="flex h-full shrink-0 border-r border-white/10 bg-white/6">
      <div className="flex w-20 shrink-0 flex-col border-r border-white/10">
        <div className="flex justify-center px-2 py-4">
          <LumenatiLogo bg="dark" className="w-11" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-2">
          {topItems.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onNavigate}
                title={n.label}
                className={`flex flex-col items-center gap-1 rounded-lg py-2 ${
                  active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6"
                }`}
              >
                <NavIcon name={n.icon} className="h-[18px] w-[18px]" />
                <span className="px-0.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide">
                  {n.label}
                </span>
              </Link>
            );
          })}
          {catSections.map((s) => {
            const isOpen = open?.title === s.title;
            const holdsPage = s.items.some((n) => pathname === n.href);
            return (
              <button
                key={s.title}
                onClick={() => setOpenCat(s.title)}
                title={s.title ?? ""}
                className={`flex flex-col items-center gap-1 rounded-lg py-2 ${
                  isOpen
                    ? "bg-white/12 text-white"
                    : holdsPage
                      ? "text-white/85 hover:bg-white/6"
                      : "text-white/65 hover:bg-white/6"
                }`}
              >
                <NavIcon name={CAT_ICONS[s.title ?? ""]} className="h-[18px] w-[18px]" />
                <span className="px-0.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide">
                  {s.title}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex w-48 flex-col">
        <nav className="flex flex-1 flex-col overflow-y-auto px-2.5 pb-2 pt-5">
          {open && (
            <>
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                {open.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {open.items.map((n) => {
                  const active = pathname === n.href;
                  return (
                    <Link
                      key={n.href}
                      href={n.soon ? "#" : n.href}
                      aria-disabled={n.soon}
                      onClick={n.soon ? (e) => e.preventDefault() : onNavigate}
                      tabIndex={n.soon ? -1 : undefined}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        active
                          ? "bg-white/12 font-semibold text-white"
                          : n.soon
                            ? "cursor-default text-white/45"
                            : "text-white/80 hover:bg-white/6"
                      }`}
                    >
                      <NavIcon
                        name={n.icon}
                        className={active ? "text-white" : "text-white/50"}
                      />
                      <span className="truncate">{n.label}</span>
                      {n.soon && (
                        <span className="ml-auto rounded bg-white/7 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                          soon
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

      {canPreview && (
        <div className="border-t border-white/10 p-3">
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
            Preview as
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {role === "artist" && (
            <select
              value={asArtistId}
              onChange={(e) => setAsArtistId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-sm"
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="border-t border-white/10 p-3">
        <div className="truncate px-1 text-[11px] text-white/60" title={email}>
          {email}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <button
            onClick={logout}
            className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6"
          >
            Log out
          </button>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="px-1 text-xs text-white/55 hover:text-white/85"
          >
            View site ↗
          </a>
        </div>
      </div>
      </div>
    </aside>
  );
}


// The full-screen stop when the free month runs out. The owner can still reach
// Billing (and nothing else); an artist is pointed at their owner. The REAL
// wall is the layout's server check — this is just the face of it.
function BillingLock() {
  const { realRole } = useRole();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/6 p-8 text-center">
        <div className="text-lg font-semibold text-white">Your free month has ended</div>
        {realRole === "owner" ? (
          <>
            <p className="mt-2 text-sm text-white/70">
              Everything is saved and safe: bookings, clients, money history, all of it.
              Pick a plan and the shop comes right back.
            </p>
            <Link
              href="/admin/billing"
              className="mt-5 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Choose a plan
            </Link>
          </>
        ) : (
          <p className="mt-2 text-sm text-white/70">
            The shop&apos;s membership has lapsed. Ask the shop owner to renew it. Your work is
            saved and comes right back when they do.
          </p>
        )}
      </div>
    </div>
  );
}

// Desktop: permanent sidebar rail. Phone: sticky top bar + slide-over drawer
// (same Sidebar, so preview-as / logout ride along).
function ShellFrame({ children, billing }: { children: React.ReactNode; billing: BillingShellState | null }) {
  const [navOpen, setNavOpen] = useState(false);
  const { realRole } = useRole();
  const pathname = usePathname();
  const locked = !!billing?.locked && pathname !== "/admin/billing";
  const trialNudge =
    !billing?.locked && billing?.trialDaysLeft != null && billing.trialDaysLeft <= 7 && realRole === "owner";
  return (
    <div className="admin-wash flex min-h-screen text-ink antialiased">
      <div className="cc-desktop-rail">
        <Sidebar />
      </div>
      <div className="cc-col">
        <header className="cc-mobile-bar">
          <div className="flex items-center gap-3">
            <LumenatiLogo bg="dark" className="w-12" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/55">
              Command Center
            </span>
          </div>
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-white/12 px-3 py-1.5 text-sm text-white/85"
          >
            Menu
          </button>
        </header>
        {trialNudge && (
          <div className="border-b border-white/10 bg-white/6 px-8 py-2 text-center text-xs text-white/75">
            {billing!.trialDaysLeft === 0
              ? "Last day of your free month."
              : `${billing!.trialDaysLeft} day${billing!.trialDaysLeft === 1 ? "" : "s"} left on your free month.`}{" "}
            <Link href="/admin/billing" className="font-semibold text-white underline underline-offset-2">
              Pick a plan
            </Link>
          </div>
        )}
        <main className="cc-main flex-1 overflow-x-hidden px-8 py-7">
          {locked ? <BillingLock /> : children}
        </main>
      </div>
      {navOpen && (
        <div className="cc-drawer">
          <div className="cc-drawer-panel">
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
          <button aria-label="Close menu" onClick={() => setNavOpen(false)} className="cc-drawer-backdrop" />
        </div>
      )}
      <BugReporter />
    </div>
  );
}

export default function AdminShell({
  realRole,
  realArtistId,
  email,
  fullName,
  shopId,
  billing = null,
  children,
}: {
  realRole: Role;
  realArtistId: string | null;
  email: string;
  fullName: string | null;
  shopId: string | null;
  billing?: BillingShellState | null;
  children: React.ReactNode;
}) {
  return (
    <RoleProvider realRole={realRole} realArtistId={realArtistId} email={email} fullName={fullName} shopId={shopId}>
      <ArtistsProvider shopId={shopId}>
        <RoomContentProvider>
          <SalesProvider>
           <RentProvider>
            <SocialProvider>
             <ClientsProvider>
              <BookingsProvider>
               <IntakeProvider>
                <ComplianceProvider>
                 <InventoryProvider>
                  <FollowupsProvider>
                   <CashProvider>
                    <ShellFrame billing={billing}>{children}</ShellFrame>
                   </CashProvider>
                  </FollowupsProvider>
                 </InventoryProvider>
                </ComplianceProvider>
               </IntakeProvider>
              </BookingsProvider>
             </ClientsProvider>
            </SocialProvider>
           </RentProvider>
          </SalesProvider>
        </RoomContentProvider>
      </ArtistsProvider>
    </RoleProvider>
  );
}
