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
// A section title can differ by role: an artist's bookings/clients/waitlist are
// their day, not a desk (no front desk here, Scott 2026-07-08).
type SectionTitle = string | { owner: string; artist: string } | null;
const titleFor = (t: SectionTitle, role: string): string | null =>
  t && typeof t === "object" ? (role === "owner" ? t.owner : t.artist) : t;
const NAV_SECTIONS: { title: SectionTitle; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Overview", roles: ["owner", "artist"], icon: "overview" },
      { href: "/admin/room", label: "My Page", roles: ["artist"], icon: "mypage" },
    ],
  },
  {
    title: { owner: "Shop floor", artist: "Your day" },
    items: [
      { href: "/admin/bookings", label: "Bookings", roles: ["owner", "artist"], icon: "bookings" },
      { href: "/admin/waitlist", label: "Waitlist", roles: ["artist"], icon: "waitlist" },
      { href: "/admin/clients", label: "Clients", roles: ["owner"], icon: "clients" },
      { href: "/admin/my-clients", label: "Clients", roles: ["artist"], icon: "clients" },
      { href: "/admin/intake", label: "Intake", roles: ["owner"], icon: "intake" },
      { href: "/admin/healed", label: "Healed Shots", roles: ["artist"], icon: "healed" },
      { href: "/admin/qr", label: "QR Card", roles: ["artist"], icon: "qr" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/admin/messages", label: "Messages", roles: ["owner", "artist"], icon: "followups" },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/admin/money", label: "Money", roles: ["owner", "artist"], icon: "pnl" },
    ],
  },
  {
    title: "Shop",
    items: [
      { href: "/admin/artists", label: "Artists & Pay", roles: ["owner"], icon: "artists" },
      { href: "/admin/room", label: "Artist pages", roles: ["owner"], icon: "artistpages" },
      { href: "/admin/inventory", label: "Inventory", roles: ["owner"], icon: "inventory" },
      { href: "/admin/compliance", label: "Compliance", roles: ["owner"], icon: "compliance" },
      { href: "/admin/social", label: "Social wall", roles: ["owner"], icon: "social" },
      { href: "/admin/guestbook", label: "Guestbook", roles: ["owner"], icon: "followups" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/settings", label: "Settings", roles: ["owner"], icon: "settings" },
      { href: "/admin/staff", label: "Team", roles: ["owner"], icon: "staff" },
    ],
  },
];

// Membership state, resolved server-side in the layout (billing columns are
// server-only). locked = trial over + no live subscription -> the shell shows
// only the Billing page.
export type BillingShellState = { locked: boolean; trialDaysLeft: number | null };

function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { role, setRole, asArtistId, setAsArtistId, canPreview, email, isY2k, shopSlug } = useRole();
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
    title: titleFor(s.title, role),
    items: s.items.filter((n) => n.roles.includes(role)),
  })).filter((s) => s.items.length > 0);

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // Sections fold. Only the section you're in needs to be open; the rest collapse
  // to a single header line, so the whole nav fits without a marathon scroll. Open
  // sections are remembered; navigating into a folded section opens it.
  const sectionOf = (path: string) =>
    titleFor(NAV_SECTIONS.find((s) => s.title && s.items.some((n) => n.href === path))?.title ?? null, role);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  useEffect(() => {
    let saved: string[] | null = null;
    try {
      const raw = localStorage.getItem("lum-nav-sections");
      if (raw) saved = JSON.parse(raw) as string[];
    } catch {
      /* ignore */
    }
    if (saved) setOpenSections(new Set(saved));
    else {
      const cur = sectionOf(pathname);
      setOpenSections(cur ? new Set([cur]) : new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const cur = sectionOf(pathname);
    if (cur) setOpenSections((prev) => (prev.has(cur) ? prev : new Set(prev).add(cur)));
  }, [pathname]);
  const toggleSection = (t: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      try {
        localStorage.setItem("lum-nav-sections", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  // One sidebar. Compact rows; collapsing narrows to an icon rail. The account
  // controls (View as, View site, Log out) live pinned at the bottom — no panel.
  const pad = collapsed ? "justify-center px-0" : "px-2.5";
  const rowCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] transition ${pad} ${
      active ? "bg-white/12 font-semibold text-white" : "text-white/70 hover:bg-white/6"
    }`;

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-white/10 bg-white/[0.04] ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Header: just the logo. The collapse control lives in the footer. */}
      <div className={`flex items-center py-3.5 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <LumenatiLogo bg="dark" className={collapsed ? "w-8" : "w-16"} />
      </div>

      {/* Nav: top items always shown; titled sections fold to a header line. When
          collapsed to icons, folding doesn't apply — every icon is shown. */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {sections.map((s, si) => {
          const isTop = !s.title;
          const isOpen = collapsed || isTop || openSections.has(s.title!);
          const rows = (
            <div className="flex flex-col gap-0.5">
              {s.items.map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.soon ? "#" : n.href}
                    onClick={n.soon ? (e) => e.preventDefault() : onNavigate}
                    aria-disabled={n.soon}
                    tabIndex={n.soon ? -1 : undefined}
                    title={collapsed ? n.label : undefined}
                    className={`${rowCls(active)}${n.soon ? " cursor-default text-white/40 hover:bg-transparent" : ""}`}
                  >
                    <NavIcon name={n.icon} className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-white/50"}`} />
                    {!collapsed && <span className="truncate">{n.label}</span>}
                    {!collapsed && n.soon && (
                      <span className="ml-auto rounded bg-white/7 px-1.5 py-0.5 text-[10px] font-medium text-white/50">soon</span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
          return (
            <div key={s.title ?? "top"} className={si > 0 && collapsed ? "mt-1" : ""}>
              {s.title && collapsed && si > 0 && <div className="mx-2 mb-1 border-t border-white/8" />}
              {s.title && !collapsed && (
                <button
                  onClick={() => toggleSection(s.title!)}
                  className={`nav-sec mt-1.5 flex w-full items-center rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest ${
                    isOpen ? "nav-sec-open" : ""
                  }`}
                >
                  {s.title}
                </button>
              )}
              {/* Slick open/close: max-height + fade so folding actually collapses. */}
              {collapsed ? (
                rows
              ) : (
                <div className={`nav-fold ${isOpen ? "nav-fold-open" : "nav-fold-closed"}`}>{rows}</div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Account: preview-as (owner), then the utility rows, pinned at the bottom. */}
      <div className="border-t border-white/10 px-2 py-2">
        {canPreview && !collapsed && (
          <div className="mb-2 px-1">
            <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">View as</div>
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

        <BugReporter variant="rail" collapsed={collapsed} />
        {/* Lumenati opens its own site; every other shop opens its roster page,
            because that IS its public presence here (the shop keeps its own website). */}
        <a
          href={isY2k || !shopSlug ? "/" : `/s/${shopSlug}`}
          target="_blank"
          rel="noreferrer"
          title={collapsed ? (isY2k ? "View site" : "View my pages") : undefined}
          className={rowCls(false)}
        >
          <NavIcon name="viewsite" className="h-4 w-4 shrink-0 text-white/55" />
          {!collapsed && <span>{isY2k ? "View site" : "View my pages"}</span>}
        </a>
        <button onClick={logout} title={collapsed ? "Log out" : undefined} className={`w-full ${rowCls(false)}`}>
          <NavIcon name="logout" className="h-4 w-4 shrink-0 text-white/55" />
          {!collapsed && <span>Log out</span>}
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className={`w-full ${rowCls(false)}`}
          >
            <NavIcon
              name="collapse"
              className={`nav-chevron h-4 w-4 shrink-0 text-white/55 ${collapsed ? "nav-flip" : ""}`}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
        {!collapsed && email && (
          <div className="truncate px-3 pt-2 text-[11px] text-white/45" title={email}>
            {email}
          </div>
        )}
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
              href="/admin/settings?tab=billing"
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
  const [collapsed, setCollapsed] = useState(false);
  const { realRole } = useRole();
  const pathname = usePathname();
  const locked = !!billing?.locked && pathname !== "/admin/billing" && pathname !== "/admin/settings";
  const trialNudge =
    !billing?.locked && billing?.trialDaysLeft != null && billing.trialDaysLeft <= 7 && realRole === "owner";

  // Remember the collapsed choice across visits.
  useEffect(() => {
    setCollapsed(localStorage.getItem("lum-nav-collapsed") === "1");
  }, []);
  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("lum-nav-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="admin-wash flex min-h-screen text-ink antialiased">
      <div className="cc-desktop-rail">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
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
            <Link href="/admin/settings?tab=billing" className="font-semibold text-white underline underline-offset-2">
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
    </div>
  );
}

export default function AdminShell({
  realRole,
  realArtistId,
  email,
  fullName,
  shopId,
  shopSlug = null,
  shopTemplate = null,
  billing = null,
  children,
}: {
  realRole: Role;
  realArtistId: string | null;
  email: string;
  fullName: string | null;
  shopId: string | null;
  shopSlug?: string | null;
  shopTemplate?: string | null;
  billing?: BillingShellState | null;
  children: React.ReactNode;
}) {
  return (
    <RoleProvider realRole={realRole} realArtistId={realArtistId} email={email} fullName={fullName} shopId={shopId} shopSlug={shopSlug} shopTemplate={shopTemplate}>
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
