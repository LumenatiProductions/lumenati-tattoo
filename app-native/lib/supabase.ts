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

export const supabase = createClient(url, anon, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
