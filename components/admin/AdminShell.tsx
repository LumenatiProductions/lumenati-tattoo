"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RoleProvider, useRole, ROLE_LABELS } from "@/lib/admin/role-context";
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
import type { Role } from "@/lib/admin/types";

const NAV: { href: string; label: string; roles: Role[]; soon?: boolean }[] = [
  { href: "/admin", label: "Overview", roles: ["owner", "bookkeeper", "artist", "frontdesk"] },
  { href: "/admin/room", label: "My Room", roles: ["owner", "artist"] },
  // Front of house
  { href: "/admin/bookings", label: "Bookings", roles: ["owner", "frontdesk", "artist"] },
  { href: "/admin/clients", label: "Clients", roles: ["owner", "frontdesk"] },
  { href: "/admin/intake", label: "Intake", roles: ["owner", "frontdesk"] },
  { href: "/admin/followups", label: "Follow-ups", roles: ["owner", "frontdesk"] },
  { href: "/admin/social", label: "Social", roles: ["owner", "frontdesk"] },
  // Money
  { href: "/admin/artists", label: "Artists & Pay", roles: ["owner", "bookkeeper"] },
  { href: "/admin/payouts", label: "Payouts", roles: ["owner", "bookkeeper", "artist"] },
  { href: "/admin/rent", label: "Booth Rent", roles: ["owner", "bookkeeper"] },
  { href: "/admin/cash", label: "Cash Log", roles: ["owner", "bookkeeper", "frontdesk"] },
  { href: "/admin/reports", label: "Reports", roles: ["owner", "bookkeeper"] },
  { href: "/admin/expenses", label: "Expenses", roles: ["owner", "bookkeeper"] },
  // Shop
  { href: "/admin/inventory", label: "Inventory", roles: ["owner", "frontdesk"] },
  { href: "/admin/compliance", label: "Compliance", roles: ["owner"] },
  // Admin
  { href: "/admin/reconcile", label: "Reconciliation", roles: ["owner", "bookkeeper"], soon: true },
  { href: "/admin/staff", label: "Staff", roles: ["owner"] },
  { href: "/admin/integrations", label: "Integrations", roles: ["owner"] },
];

function Sidebar() {
  const { role, setRole, asArtistId, setAsArtistId, canPreview, email } = useRole();
  const { artists } = useArtists();
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((n) => n.roles.includes(role));

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-black/8 bg-white">
      <div className="px-5 py-5">
        <LumenatiLogo bg="light" className="w-28" />
        <div className="mt-2 text-[11px] font-medium uppercase tracking-widest text-black/40">
          Command Center
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {items.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.soon ? "#" : n.href}
              aria-disabled={n.soon}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                active
                  ? "bg-brand-soft font-semibold text-brand"
                  : n.soon
                    ? "cursor-default text-black/30"
                    : "text-black/65 hover:bg-black/4"
              }`}
            >
              {n.label}
              {n.soon && (
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-black/35">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {canPreview && (
        <div className="border-t border-black/8 p-3">
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-black/35">
            Preview as
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm"
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {role === "artist" && (
            <select
              value={asArtistId}
              onChange={(e) => setAsArtistId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm"
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

      <div className="border-t border-black/8 p-3">
        <div className="truncate px-1 text-[11px] text-black/45" title={email}>
          {email}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <button
            onClick={logout}
            className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-black/60 hover:bg-black/4"
          >
            Log out
          </button>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="px-1 text-xs text-black/40 hover:text-black/70"
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
                    <div className="flex min-h-screen bg-paper text-ink antialiased">
                      <Sidebar />
                      <main className="flex-1 overflow-x-hidden px-8 py-7">{children}</main>
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
