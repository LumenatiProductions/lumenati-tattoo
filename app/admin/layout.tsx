"use client";

import "./admin.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleProvider, useRole, ROLE_LABELS } from "@/lib/admin/role-context";
import { ARTISTS } from "@/lib/admin/mock-data";
import type { Role } from "@/lib/admin/types";

const NAV: { href: string; label: string; roles: Role[]; soon?: boolean }[] = [
  { href: "/admin", label: "Overview", roles: ["owner", "bookkeeper", "artist", "frontdesk"] },
  { href: "/admin/artists", label: "Artists & Pay", roles: ["owner", "bookkeeper"] },
  { href: "/admin/payouts", label: "Payouts", roles: ["owner", "bookkeeper", "artist"] },
  { href: "/admin/cash", label: "Cash Log", roles: ["owner", "bookkeeper", "frontdesk"] },
  { href: "/admin/reconcile", label: "Reconciliation", roles: ["owner", "bookkeeper"], soon: true },
  { href: "/admin/reports", label: "Reports", roles: ["owner", "bookkeeper"], soon: true },
  { href: "/admin/integrations", label: "Integrations", roles: ["owner"], soon: true },
];

function Sidebar() {
  const { role, setRole, asArtistId, setAsArtistId } = useRole();
  const pathname = usePathname();
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-black/8 bg-white">
      <div className="px-5 py-5">
        <div className="text-lg font-black tracking-tight text-ink">
          LUMENATI<span className="text-brand">.</span>
        </div>
        <div className="text-[11px] font-medium uppercase tracking-widest text-black/40">
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

      {/* Demo role switcher — replaced by real auth/session later. */}
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
            {ARTISTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <Link
          href="/"
          className="mt-3 block px-1 text-xs text-black/40 hover:text-black/70"
        >
          ← back to the site
        </Link>
      </div>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <div className="flex min-h-screen bg-paper text-ink antialiased">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden px-8 py-7">{children}</main>
      </div>
    </RoleProvider>
  );
}
