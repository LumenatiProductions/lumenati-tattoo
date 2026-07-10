import { supabase } from "./supabase";

// Calls to the Next API (Tap to Pay, settlements). The web admin uses cookie
// auth; the app sends its Supabase access token as a Bearer (see lib/api-auth.ts
// server-side). Reads still go straight to Supabase under RLS — this is only for
// the Stripe/server actions.
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiGet<T = unknown>(path: string): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: await authHeaders() });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: d as T } : { ok: false, error: d.error || `Request failed (${r.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: d as T } : { ok: false, error: d.error || `Request failed (${r.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function apiPatch<T = unknown>(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: d as T } : { ok: false, error: d.error || `Request failed (${r.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
