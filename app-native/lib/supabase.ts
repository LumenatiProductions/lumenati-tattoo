import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// The app talks to the SAME Supabase project as the web admin. Reads are
// RLS-scoped exactly like the web's browser contexts (an artist only sees their
// own rows), so 6a needs no backend change. AsyncStorage persists the session on
// native and falls back to localStorage on web — one client, all targets.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anon);

// supabase-js throws synchronously on an empty url, and this module is imported
// at launch — so a build missing the env vars would white-screen instantly.
// Fall back to inert placeholders; supabaseConfigured stays false so the UI can
// degrade gracefully instead of crashing.
export const supabase = createClient(url || "https://unconfigured.supabase.co", anon || "unconfigured", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
