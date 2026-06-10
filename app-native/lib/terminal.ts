import { Platform } from "react-native";
import Constants from "expo-constants";
import { apiPost } from "./appApi";

// Tap to Pay facade (POS 6c). The real card-present collection runs through
// `@stripe/stripe-terminal-react-native`, which is a NATIVE module: it needs the
// package installed AND a dev build (not Expo Go), plus Apple Tap to Pay / Android
// enrollment. This facade keeps the rest of the app building + running everywhere
// (web shows "use your phone") and drops the SDK in once it's available.
//
// To finish on a dev build:
//   1. npm install @stripe/stripe-terminal-react-native
//   2. add its Expo config plugin to app.json + the Tap to Pay entitlement
//   3. wrap the app in <StripeTerminalProvider tokenProvider={getConnectionToken}>
//   4. replace the `loadSdk()` stub below with the real import and confirm the
//      method names against the installed SDK version.

export type PayResult = { ok: boolean; error?: string };

// Expo Go can never have the native module, and Metro's inline-requires can
// hoist a literal require() out of try/catch in dev — so gate BEFORE requiring
// (this crashed the POS screen in Expo Go with an uncaught redbox).
const inExpoGo = Constants.appOwnership === "expo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSdk(): any | null {
  if (Platform.OS === "web" || inExpoGo) return null;
  try {
    // Lazy, non-literal require so a missing native module never breaks the
    // bundle/tsc and never gets hoisted by the inliner.
    const name = "@stripe/stripe-terminal-react-native";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(`${name}`);
  } catch {
    return null;
  }
}

export function tapToPayAvailable(): boolean {
  return Platform.OS !== "web" && loadSdk() !== null;
}

// The connection token the SDK needs comes from our Bearer-authed endpoint.
export async function getConnectionToken(): Promise<string> {
  const r = await apiPost<{ secret: string }>("/api/terminal/connection-token");
  if (!r.ok || !r.data?.secret) throw new Error(r.error || "No connection token");
  return r.data.secret;
}

// Take an in-person payment. Mints the destination-charge PaymentIntent on our
// server (same split as web), then collects + confirms the card via Tap to Pay.
export async function takeTapToPayPayment(
  amountCents: number,
  opts: { artistId?: string; bookingId?: string } = {},
): Promise<PayResult> {
  const sdk = loadSdk();
  if (!sdk) {
    return { ok: false, error: "Tap to Pay needs the phone app (dev build). Use a pay link on web." };
  }

  // 1) Server mints the PaymentIntent (split handled there).
  const pi = await apiPost<{ clientSecret: string; paymentIntentId: string }>(
    "/api/terminal/payment-intent",
    { amountCents, artistId: opts.artistId, bookingId: opts.bookingId },
  );
  if (!pi.ok || !pi.data?.clientSecret) return { ok: false, error: pi.error || "Could not start payment" };

  // 2) Collect + confirm via the Terminal SDK. Method names match
  //    @stripe/stripe-terminal-react-native's imperative API; confirm against the
  //    installed version on the dev build.
  try {
    const reader = sdk.useStripeTerminal ?? sdk; // provider exposes the same fns
    const discovered = await reader.discoverReaders({ discoveryMethod: "tapToPay" });
    if (discovered?.error) return { ok: false, error: discovered.error.message };
    const first = discovered?.readers?.[0];
    if (first) await reader.connectReader({ reader: first }, "tapToPay");

    const collect = await reader.collectPaymentMethod({ paymentIntentClientSecret: pi.data.clientSecret });
    if (collect?.error) return { ok: false, error: collect.error.message };

    const confirm = await reader.confirmPaymentIntent({ paymentIntent: collect.paymentIntent });
    if (confirm?.error) return { ok: false, error: confirm.error.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tap to Pay failed" };
  }
}
