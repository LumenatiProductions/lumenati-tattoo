"use client";

import Link from "next/link";
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

type NavItem = { href: string; label: string; roles: Role[]; soon?: boolean };
// Sections render as small headers in the sidebar; a header only appears when
// the current role can see at least one page inside it.
const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Overview", roles: ["owner", "artist"] },
      { href: "/admin/room", label: "My Room", roles: ["owner", "artist"] },
    ],
  },
  {
    title: "Front of house",
    items: [
      { href: "/admin/bookings", label: "Bookings", roles: ["owner", "artist"] },
      { href: "/admin/clients", label: "Clients", roles: ["owner"] },
      { href: "/admin/intake", label: "Intake", roles: ["owner"] },
      { href: "/admin/followups", label: "Follow-ups", roles: ["owner"] },
      { href: "/admin/social", label: "Social", roles: ["owner"] },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/admin/pnl", label: "Profit & Loss", roles: ["owner"] },
      { href: "/admin/reports", label: "Reports", roles: ["owner"] },
      { href: "/admin/payouts", label: "Pay", roles: ["owner", "artist"] },
      { href: "/admin/rent", label: "Booth Rent", roles: ["owner"] },
      { href: "/admin/cash", label: "Cash Log", roles: ["owner"] },
      { href: "/admin/expenses", label: "Expenses", roles: ["owner"] },
      { href: "/admin/reconcile", label: "Reconciliation", roles: ["owner"] },
    ],
  },
  {
    title: "Shop",
    items: [
      { href: "/admin/artists", label: "Artists & Pay", roles: ["owner"] },
      { href: "/admin/inventory", label: "Inventory", roles: ["owner"] },
      { href: "/admin/compliance", label: "Compliance", roles: ["owner"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/staff", label: "Staff", roles: ["owner"] },
      { href: "/admin/integrations", label: "Integrations", roles: ["owner"] },
    ],
  },
];

function Sidebar() {
  const { role, setRole, asArtistId, setAsArtistId, canPreview, email } = useRole();
  const { artists } = useArtists();
  const pathname = usePathname();
  const router = useRouter();
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((n) => n.roles.includes(role)),
  })).filter((s) => s.items.length > 0);

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-white/6">
      <div className="px-5 py-4">
        <LumenatiLogo bg="dark" className="w-16" />
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-white/55">
          Command Center
        </div>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-2">
        {sections.map((s, i) => (
          <div key={s.title ?? "top"} className={i === 0 ? "" : "mt-3"}>
            {s.title && (
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                {s.title}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {s.items.map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.soon ? "#" : n.href}
                    aria-disabled={n.soon}
                    onClick={n.soon ? (e) => e.preventDefault() : undefined}
                    tabIndex={n.soon ? -1 : undefined}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      active
                        ? "bg-white/12 font-semibold text-white"
                        : n.soon
                          ? "cursor-default text-white/45"
                          : "text-white/80 hover:bg-white/6"
                    }`}
                  >
                    {n.label}
                    {n.soon && (
                      <span className="rounded bg-white/7 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                        soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
    </aside>
  );
}

export default function AdminShell({
  realRole,
  realArtistId,
  email,
  fullName,
  children,
}: {
  realRole: Role;
  realArtistId: string | null;
  email: string;
  fullName: string | null;
  children: React.ReactNode;
}) {
  return (
    <RoleProvider realRole={realRole} realArtistId={realArtistId} email={email} fullName={fullName}>
      <ArtistsProvider>
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
                    <div className="admin-wash flex min-h-screen text-ink antialiased">
                      <Sidebar />
                      <main className="flex-1 overflow-x-hidden px-8 py-7">{children}</main>
                      <BugReporter />
                    </div>
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
