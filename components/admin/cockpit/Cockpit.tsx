"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBookings } from "@/lib/admin/bookings-context";
import { useInventory } from "@/lib/admin/inventory-context";
import { useCompliance } from "@/lib/admin/compliance-context";
import { useFollowups } from "@/lib/admin/followups-context";
import { fmt } from "@/lib/admin/calc";
import { Card, SectionTitle } from "@/components/admin/ui";
import { isToday } from "@/components/admin/home/shared";

// The owner cockpit (POS-STARTER-4): every feature's headline as a glance row of
// tiles, plus ONE ranked "needs attention" list — the things actually needing a
// decision, most urgent first. Each is a card you clear by swiping it away or
// tapping ×: a Health failure clears = marked handled; a derived alert = snoozed
// for the day (it comes back if it's still true). Health lives here now too, so
// there's a single attention surface, not a banner AND a list.

type Sev = "high" | "med" | "low";
const SEV_RANK: Record<Sev, number> = { high: 0, med: 1, low: 2 };

// key: stable id for snooze; healthId: set when this is an ops_events row, so
// clearing it marks the event handled instead of snoozing.
type Item = { key: string; sev: Sev; label: string; detail?: string; href: string; healthId?: string };

type HealthEvent = { id: string; kind: string; severity: "info" | "warn" | "error"; summary: string };
const HEALTH_LABEL: Record<string, string> = {
  payment_failed: "Payment failed",
  dispute: "Payment dispute",
  sms_failed: "Text didn't send",
  email_failed: "Email didn't send",
  webhook_error: "Payment sync problem",
  cron_error: "Automation problem",
  client_error: "App error",
};

const SNOOZE_KEY = "lum-attn-snooze";
const SNOOZE_MS = 12 * 60 * 60 * 1000; // derived alerts hush for half a day

export default function Cockpit() {
  const router = useRouter();
  const { bookings, today, depositsHeld } = useBookings();
  const { lowStock } = useInventory();
  const { expiringSoon } = useCompliance();
  const { dueToday: followupsDue, pending: followupsPending } = useFollowups();

  const [health, setHealth] = useState<HealthEvent[]>([]);
  const [healthLoaded, setHealthLoaded] = useState(false);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}") as Record<string, number>;
      const now = Date.now();
      const live = Object.fromEntries(Object.entries(raw).filter(([, exp]) => exp > now));
      setSnoozed(live);
    } catch {
      /* ignore */
    }
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(((d?.events as HealthEvent[]) ?? []).filter((e) => !("resolved_at" in e && (e as { resolved_at?: string }).resolved_at))))
      .catch(() => {})
      .finally(() => setHealthLoaded(true));
  }, []);

  const checkedInToday = useMemo(
    () => bookings.filter((b) => isToday(b.starts_at) && b.checked_in_at).length,
    [bookings],
  );
  const outOfStock = useMemo(() => lowStock.filter((i) => i.qty <= 0), [lowStock]);
  const expired = useMemo(() => expiringSoon.filter((c) => c.status === "expired"), [expiringSoon]);

  const items = useMemo(() => {
    const out: Item[] = [];
    // Health failures lead — a dispute or a dead send outranks routine ops.
    for (const e of health) {
      if (resolved.has(e.id)) continue;
      // App errors are for whoever maintains the software, not the shop owner.
      // They stay on the Health page; the attention list is shop problems only.
      if (e.kind === "client_error") continue;
      out.push({
        key: `health-${e.id}`,
        sev: e.severity === "error" ? "high" : "med",
        label: e.summary,
        detail: `${HEALTH_LABEL[e.kind] ?? e.kind} · clears when handled`,
        href: "/admin/settings?tab=health",
        healthId: e.id,
      });
    }
    if (expired.length)
      out.push({ key: "comp-exp", sev: "high", label: `${expired.length} license/permit expired`, detail: "renew to stay inspection-ready", href: "/admin/compliance" });
    const expiringNotExpired = expiringSoon.length - expired.length;
    if (expiringNotExpired > 0)
      out.push({ key: "comp-soon", sev: "med", label: `${expiringNotExpired} expiring within 30 days`, href: "/admin/compliance" });
    if (outOfStock.length)
      out.push({ key: "stock-out", sev: "high", label: `${outOfStock.length} suppl${outOfStock.length === 1 ? "y" : "ies"} out`, detail: outOfStock.slice(0, 3).map((i) => i.name).join(", "), href: "/admin/inventory" });
    const lowNotOut = lowStock.length - outOfStock.length;
    if (lowNotOut > 0)
      out.push({ key: "stock-low", sev: "med", label: `${lowNotOut} item${lowNotOut === 1 ? "" : "s"} low`, detail: "below reorder point", href: "/admin/inventory" });
    if (followupsDue)
      out.push({ key: "fu", sev: "med", label: `${followupsDue} follow-up${followupsDue === 1 ? "" : "s"} due`, detail: followupsPending ? `${followupsPending} pending total` : undefined, href: "/admin/messages?tab=queue" });
    if (today)
      out.push({ key: "appts", sev: "low", label: `${today} appointment${today === 1 ? "" : "s"} today`, detail: `${checkedInToday} checked in`, href: "/admin/bookings" });
    if (depositsHeld)
      out.push({ key: "dep", sev: "low", label: `${fmt(depositsHeld)} in deposits held`, href: "/admin/bookings" });
    return out
      .filter((it) => !snoozed[it.key])
      .sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
  }, [health, resolved, snoozed, expired, expiringSoon, outOfStock, lowStock, followupsDue, followupsPending, today, checkedInToday, depositsHeld]);

  const dismiss = useCallback((it: Item) => {
    if (it.healthId) {
      // A health failure: clearing it means it's been handled.
      setResolved((s) => new Set(s).add(it.healthId!));
      fetch("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", id: it.healthId }),
      }).catch(() => {});
    } else {
      // A derived alert: hush it for the day; it returns if it's still true.
      setSnoozed((s) => {
        const next = { ...s, [it.key]: Date.now() + SNOOZE_MS };
        try {
          localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
  }, []);

  return (
    <div className="mb-6">
      {/* No glance tiles here any more (Scott, 2026-09-01: the desktop was a
          wall of numbers). Anything that needs a decision is a card below;
          everything else lives on Money. */}
      <SectionTitle>Needs attention</SectionTitle>
      {items.length === 0 ? (
        <Card>
          <div className="px-4 py-8 text-center text-sm text-white/55">
            {healthLoaded
              ? "All clear. Nothing needs a decision right now."
              : "Checking what needs your attention..."}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <AttentionCard
              key={it.key}
              item={it}
              onOpen={() => router.push(it.href)}
              onDismiss={() => dismiss(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A swipe-to-clear card. Drag it sideways past the threshold (or tap ×) to clear;
// a plain tap opens where you act. Pointer events cover mouse + touch; the drag
// is distinguished from a tap by movement, so a click still navigates.
function AttentionCard({ item, onOpen, onDismiss }: { item: Item; onOpen: () => void; onDismiss: () => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [gone, setGone] = useState(false);
  const start = useRef(0);
  const moved = useRef(false);

  const down = (e: React.PointerEvent) => {
    setDragging(true);
    moved.current = false;
    start.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const d = e.clientX - start.current;
    if (Math.abs(d) > 6) moved.current = true;
    setDx(d);
  };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dx) > 120) {
      setGone(true);
      setDx(dx > 0 ? 600 : -600);
      window.setTimeout(onDismiss, 180);
    } else {
      setDx(0);
    }
  };

  const dot = item.sev === "high" ? "bg-rose-500" : item.sev === "med" ? "bg-amber-500" : "bg-white/25";

  return (
    <div
      className="touch-pan-y select-none rounded-xl border border-white/10 bg-white/[0.055]"
      style={{
        transform: `translateX(${dx}px)`,
        opacity: gone ? 0 : 1 - Math.min(Math.abs(dx) / 320, 0.55),
        transition: dragging ? "none" : "transform .18s ease, opacity .18s ease",
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <button
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={() => {
            if (!moved.current) onOpen();
          }}
        >
          <div className="truncate text-sm font-medium">{item.label}</div>
          {item.detail && <div className="truncate text-xs text-white/60">{item.detail}</div>}
        </button>
        <button
          aria-label="Clear"
          onClick={(e) => {
            e.stopPropagation();
            setGone(true);
            window.setTimeout(onDismiss, 150);
          }}
          className="flex-none rounded-md px-2 py-1 text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          ×
        </button>
      </div>
    </div>
  );
}

