/// <reference types="expo/types" />

// Public env (EXPO_PUBLIC_*) is inlined at build time and safe in the client.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
    EXPO_PUBLIC_API_URL: string;
  }
}
