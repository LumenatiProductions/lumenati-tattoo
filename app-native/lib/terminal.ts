import { Platform } from "react-native";
import Constants from "expo-constants";
import { apiPost } from "./appApi";

// Tap to Pay support (POS 6c — entitlement approved by Apple 2026-06-10).
// The native Stripe Terminal SDK only exists in real builds (TestFlight/dev
// client), never in Expo Go or on web — everything here gates on that so the
// rest of the app keeps running everywhere.

export const inExpoGo = Constants.appOwnership === "expo";

export function tapToPayAvailable(): boolean {
  // Apple's grant is dev-restricted until the flow-video review passes, so
  // only dev-profile builds (EXPO_PUBLIC_TTP=1) light up the real flow.
  // Android Tap to Pay needs separate Google enrollment — iOS first.
  return Platform.OS === "ios" && !inExpoGo && process.env.EXPO_PUBLIC_TTP === "1";
}

// The connection token the SDK needs comes from our Bearer-authed endpoint.
export async function getConnectionToken(): Promise<string> {
  const r = await apiPost<{ secret: string }>("/api/terminal/connection-token");
  if (!r.ok || !r.data?.secret) throw new Error(r.error || "No connection token");
  return r.data.secret;
}

// The shop's Terminal Location (get-or-create server-side).
export async function getLocationId(): Promise<string> {
  const r = await apiPost<{ locationId: string }>("/api/terminal/location");
  if (!r.ok || !r.data?.locationId) throw new Error(r.error || "No terminal location");
  return r.data.locationId;
}

// Server mints the destination-charge PaymentIntent (split handled there).
export async function createTapToPayIntent(
  amountCents: number,
  opts: { artistId?: string; bookingId?: string } = {},
): Promise<{ clientSecret: string }> {
  const r = await apiPost<{ clientSecret: string; paymentIntentId: string }>(
    "/api/terminal/payment-intent",
    { amountCents, ...opts },
  );
  if (!r.ok || !r.data?.clientSecret) throw new Error(r.error || "Could not start the payment");
  return { clientSecret: r.data.clientSecret };
}
