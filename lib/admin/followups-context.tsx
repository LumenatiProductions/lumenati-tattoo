"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { FollowupKind, Template } from "@/lib/followups/templates";

// Mirrors the DB row shape (snake_case) so the page reads it directly.
export type Followup = {
  id: string;
  booking_id: string | null;
  client_id: string | null;
  kind: FollowupKind;
  channel: string;
  scheduled_for: string | null;
  status: "pending" | "sent" | "skipped" | "failed";
  sent_at: string | null;
  result: string | null;
  created_at: string;
};

type ScanResult = {
  ok: boolean;
  error?: string;
  enqueued?: number;
};

type FollowupsCtx = {
  followups: Followup[];
  templates: Template[];
  loading: boolean;
  error: string | null;
  // Overview aggregate surfaced for the integration pass.
  dueToday: number;
  pending: number;
  sentThisWeek: number;
  refresh: () => Promise<void>;
  scanNow: () => Promise<ScanResult>;
  sendNow: (id: string) => Promise<{ ok: boolean; error?: string }>;
  skip: (id: string) => Promise<{ ok: boolean; error?: string }>;
  requeue: (id: string) => Promise<{ ok: boolean; error?: string }>;
  saveTemplate: (t: {
    kind: FollowupKind;
    subject: string;
    body: string;
    lead_days: number;
    enabled: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
};

const Ctx = createContext<FollowupsCtx>({
  followups: [],
  templates: [],
  loading: true,
  error: null,
  dueToday: 0,
  pending: 0,
  sentThisWeek: 0,
  refresh: async () => {},
  scanNow: async () => ({ ok: false }),
  sendNow: async () => ({ ok: false }),
  skip: async () => ({ ok: false }),
  requeue: async () => ({ ok: false }),
  saveTemplate: async () => ({ ok: false }),
});

const todayKey = () => new Date().toISOString().slice(0, 10);

export function FollowupsProvider({ children }: { children: React.ReactNode }) {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [fr, tr] = await Promise.all([
        fetch("/api/followups"),
        fetch("/api/followups/templates"),
      ]);
      const fd = await fr.json().catch(() => ({}));
      const td = await tr.json().catch(() => ({}));
      if (fr.ok) {
        setFollowups(fd.followups || []);
        setError(null);
      } else {
        setError(fd.error || "Could not load follow-ups.");
      }
      if (tr.ok) setTemplates(td.templates || []);
    } catch {
      setError("Could not load follow-ups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const scanNow: FollowupsCtx["scanNow"] = useCallback(async () => {
    const r = await fetch("/api/followups", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error || "Scan failed." };
    await refresh();
    return { ok: true, enqueued: d.enqueued };
  }, [refresh]);

  const sendNow: FollowupsCtx["sendNow"] = useCallback(
    async (id) => {
      const r = await fetch("/api/followups/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json().catch(() => ({}));
      await refresh();
      if (!r.ok || d.ok === false) return { ok: false, error: d.error || "Send failed." };
      return { ok: true };
    },
    [refresh],
  );

  const setStatus = useCallback(
    async (id: string, status: "skipped" | "pending") => {
      const r = await fetch("/api/followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const d = await r.json().catch(() => ({}));
      await refresh();
      if (!r.ok) return { ok: false, error: d.error || "Could not update." };
      return { ok: true };
    },
    [refresh],
  );

  const skip: FollowupsCtx["skip"] = useCallback((id) => setStatus(id, "skipped"), [setStatus]);
  const requeue: FollowupsCtx["requeue"] = useCallback((id) => setStatus(id, "pending"), [setStatus]);

  const saveTemplate: FollowupsCtx["saveTemplate"] = useCallback(
    async (t) => {
      const r = await fetch("/api/followups/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not save template." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const { dueToday, pending, sentThisWeek } = useMemo(() => {
    const tk = todayKey();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    return {
      dueToday: followups.filter(
        (f) => f.status === "pending" && f.scheduled_for !== null && f.scheduled_for <= tk,
      ).length,
      pending: followups.filter((f) => f.status === "pending").length,
      sentThisWeek: followups.filter((f) => f.status === "sent" && (f.sent_at ?? "") >= weekAgo)
        .length,
    };
  }, [followups]);

  return (
    <Ctx.Provider
      value={{
        followups,
        templates,
        loading,
        error,
        dueToday,
        pending,
        sentThisWeek,
        refresh,
        scanNow,
        sendNow,
        skip,
        requeue,
        saveTemplate,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useFollowups = () => useContext(Ctx);
