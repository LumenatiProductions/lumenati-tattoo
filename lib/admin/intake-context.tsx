"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { IdType } from "@/lib/intake/forms";

// Mirrors the DB row shape (snake_case) so the page reads it directly.
export type ConsentForm = {
  id: string;
  booking_id: string | null;
  client_id: string | null;
  artist_id: string | null;
  signed_name: string | null;
  dob: string | null;
  id_checked: boolean;
  id_type: IdType | null;
  age_ok: boolean | null;
  placement: string | null;
  medical_flags: string;
  aftercare_ack: boolean;
  signature_svg: string | null;
  // Guardian co-sign (guardian-schema.sql) — set only for under-age signers
  // when the shop's minors policy is on.
  guardian_name?: string | null;
  guardian_dob?: string | null;
  guardian_relationship?: string | null;
  guardian_signature_svg?: string | null;
  answers: Record<string, unknown>;
  sign_token: string | null;
  signed_at: string | null;
  voided: boolean;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
};

// What the front desk passes to start a form. Either a tablet walk-through
// (left to be signed inline) or a "send link" form the client fills remotely.
export type NewForm = {
  bookingId?: string | null;
  clientId?: string | null;
  artistId?: string | null;
  placement?: string;
};

export type FormPatch = {
  idChecked?: boolean;
  idType?: IdType | null;
  artistId?: string | null;
  placement?: string;
};

type IntakeCtx = {
  forms: ConsentForm[];
  loading: boolean;
  error: string | null;
  // Overview aggregate (integration pass): bookings today missing a signed,
  // non-voided consent form. Computed server-side against the bookings table.
  unsignedToday: number;
  refresh: () => Promise<void>;
  createForm: (input: NewForm) => Promise<{ ok: boolean; error?: string; form?: ConsentForm; signUrl?: string }>;
  updateForm: (id: string, patch: FormPatch) => Promise<{ ok: boolean; error?: string }>;
  voidForm: (id: string, reason: string) => Promise<{ ok: boolean; error?: string }>;
  sendLink: (id: string, to: string) => Promise<{ ok: boolean; error?: string; signUrl?: string; preview?: boolean }>;
  signUrlFor: (form: ConsentForm) => string | null;
};

const noop = async () => ({ ok: false });

const Ctx = createContext<IntakeCtx>({
  forms: [],
  loading: true,
  error: null,
  unsignedToday: 0,
  refresh: async () => {},
  createForm: noop,
  updateForm: noop,
  voidForm: noop,
  sendLink: noop,
  signUrlFor: () => null,
});

export function IntakeProvider({ children }: { children: React.ReactNode }) {
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [unsignedToday, setUnsignedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/intake");
      const d = await r.json();
      if (r.ok) {
        setForms(d.forms || []);
        setUnsignedToday(d.unsignedToday ?? 0);
        setError(null);
      } else {
        setError(d.error || "Could not load consent forms.");
      }
    } catch {
      setError("Could not load consent forms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createForm: IntakeCtx["createForm"] = useCallback(
    async (input) => {
      const r = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not start that form." };
      await refresh();
      return { ok: true, form: d.form, signUrl: d.signUrl };
    },
    [refresh],
  );

  const updateForm: IntakeCtx["updateForm"] = useCallback(
    async (id, patch) => {
      const r = await fetch("/api/intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await r.json().catch(() => ({}));
      await refresh();
      if (!r.ok) return { ok: false, error: d.error || "Could not save." };
      return { ok: true };
    },
    [refresh],
  );

  const voidForm: IntakeCtx["voidForm"] = useCallback(
    async (id, reason) => {
      const r = await fetch("/api/intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, void: true, voidReason: reason }),
      });
      const d = await r.json().catch(() => ({}));
      await refresh();
      if (!r.ok) return { ok: false, error: d.error || "Could not void." };
      return { ok: true };
    },
    [refresh],
  );

  const sendLink: IntakeCtx["sendLink"] = useCallback(async (id, to) => {
    const r = await fetch("/api/intake/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, to }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error || "Could not send the link." };
    return { ok: true, signUrl: d.signUrl, preview: d.preview };
  }, []);

  // Build the public signing URL from the token, using the current origin so it
  // works in dev and prod without an env var.
  const signUrlFor = useCallback((form: ConsentForm) => {
    if (!form.sign_token || form.signed_at || form.voided) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/intake/${form.sign_token}`;
  }, []);

  const value = useMemo(
    () => ({
      forms,
      loading,
      error,
      unsignedToday,
      refresh,
      createForm,
      updateForm,
      voidForm,
      sendLink,
      signUrlFor,
    }),
    [forms, loading, error, unsignedToday, refresh, createForm, updateForm, voidForm, sendLink, signUrlFor],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useIntake = () => useContext(Ctx);
