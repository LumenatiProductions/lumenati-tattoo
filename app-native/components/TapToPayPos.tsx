import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { armed, picked, trouble } from "@/lib/haptics";
import { useStripeTerminal, type Reader } from "@stripe/stripe-terminal-react-native";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { Chips } from "@/components/form";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { createTapToPayIntent, getLocationId } from "@/lib/terminal";
import Y2kPaidFX from "@/components/Y2kPaidFX";

// The real Tap to Pay flow (iOS, real builds only — pos.tsx gates rendering).
// One screen, one motion: type the amount, hit charge, client taps their card
// on the phone. The phone IS the reader: discover the built-in tapToPay
// reader, connect it to the shop's Terminal Location, then collect + confirm
// the server-minted destination-charge PaymentIntent.

type Phase = "idle" | "connecting" | "collecting" | "done";

const TIP_PRESETS = [15, 20, 25] as const;

export default function TapToPayPos() {
  const { role, email } = useAuth();
  const { preview } = usePreview();
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [paidCents, setPaidCents] = useState(0);
  const [fx, setFx] = useState(false);
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [who, setWho] = useState("shop");
  // Client-chosen tip, off the service amount. Only for artist tickets — a shop
  // (merch) sale has no artist to tip. Tip rides to the artist in full.
  const [tipPct, setTipPct] = useState<number | "custom" | null>(null);
  const [tipCustom, setTipCustom] = useState("");
  // Dev builds only: Stripe test mode declines real cards (test_mode_live_card),
  // so a simulated reader is the only way to see a successful tap end to end
  // until the live keys land. Never shown in TestFlight/production builds.
  const [simulated, setSimulated] = useState(false);
  const readerRef = useRef<Reader.Type | null>(null);

  const {
    initialize,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      readerRef.current = readers[0] ?? null;
    },
  });

  useEffect(() => {
    initialize();
    (async () => {
      const { data } = await supabase.from("artists").select("id, name").eq("active", true).order("sort");
      let roster = (data ?? []) as { id: string; name: string }[];
      // Artists ring up themselves (their own terms apply) or the shop (merch).
      // Never other artists — the server enforces the same rule. An owner
      // previewing an artist gets the same view (charges attribute to that
      // artist, which is who's being demoed).
      if (preview) {
        roster = roster.filter((a) => a.id === preview.artistId);
        setWho(preview.artistId);
      } else if (role === "artist" && email) {
        const { data: p } = await supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle();
        const mine = p?.artist_id as string | null;
        roster = roster.filter((a) => a.id === mine);
        if (mine) setWho(mine);
      }
      setArtists(roster);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cents = Math.round((Number(amount) || 0) * 100);
  const tippable = who !== "shop";
  const whoName = artists.find((a) => a.id === who)?.name ?? "";
  const tipCents = !tippable
    ? 0
    : tipPct === "custom"
      ? Math.max(0, Math.round((Number(tipCustom) || 0) * 100))
      : tipPct
        ? Math.round((cents * tipPct) / 100)
        : 0;
  const totalCents = cents + tipCents;

  const ensureConnected = useCallback(async () => {
    if (connectedReader) return;
    setPhase("connecting");
    const locationId = await getLocationId();
    await discoverReaders({ discoveryMethod: "tapToPay", simulated });
    // discovery reports the phone's built-in reader via the callback
    const started = Date.now();
    while (!readerRef.current && Date.now() - started < 15000) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const reader = readerRef.current;
    if (!reader) throw new Error("This iPhone's reader didn't come up — Tap to Pay needs iPhone XS or newer.");
    await cancelDiscovering();
    const { error: connErr } = await connectReader({
      discoveryMethod: "tapToPay",
      reader,
      locationId,
      merchantDisplayName: "Lumenati Tattoo",
      autoReconnectOnUnexpectedDisconnect: true,
    });
    if (connErr) throw new Error(connErr.message);
  }, [connectedReader, discoverReaders, cancelDiscovering, connectReader, simulated]);

  const take = useCallback(async () => {
    if (cents < 50) return;
    setError(null);
    try {
      await ensureConnected();
      setPhase("collecting");
      const { clientSecret } = await createTapToPayIntent(
        cents,
        who === "shop" ? { shop: true } : { artistId: who, tipCents },
      );
      const ret = await retrievePaymentIntent(clientSecret);
      if (ret.error || !ret.paymentIntent) throw new Error(ret.error?.message || "Could not load the payment");
      armed(); // heads-up thump: the tap sheet is coming up
      const col = await collectPaymentMethod({ paymentIntent: ret.paymentIntent });
      if (col.error || !col.paymentIntent) throw new Error(col.error?.message || "Card not collected");
      const conf = await confirmPaymentIntent({ paymentIntent: col.paymentIntent });
      if (conf.error) throw new Error(conf.error.message);
      setPaidCents(totalCents); // service + tip — what the card was actually charged
      setPhase("done");
      setAmount("");
      setTipPct(null);
      setTipCustom("");
      // Let the system payment sheet fully dismiss before the blast starts,
      // so nothing sits on top of it.
      setTimeout(() => setFx(true), 650);
    } catch (e) {
      trouble();
      setError(e instanceof Error ? e.message : "Payment failed.");
      setPhase("idle");
    }
  }, [cents, who, tipCents, totalCents, ensureConnected, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent]);

  if (phase === "done") {
    return (
      <>
      <Card>
        <Text style={styles.doneCheck}>✓</Text>
        <Text style={styles.doneTitle}>Paid {money(paidCents)}</Text>
        <Text style={styles.doneSub}>Your split is on its way — cash out anytime.</Text>
        <View style={{ height: 14 }} />
        <Button label="New payment" tone="ghost" onPress={() => setPhase("idle")} />
      </Card>
      {/* Rendered after the Card so the blast owns the whole screen. */}
      {fx && <Y2kPaidFX cents={paidCents} onDone={() => setFx(false)} />}
      </>
    );
  }

  const busy = phase !== "idle";
  const hasAmount = cents >= 50;

  // Keypad editing: amount stays a plain string ("84", "84.5", "84.50").
  const press = (k: string) => {
    if (busy) return;
    picked(); // softest tick the OS has
    setAmount((a) => {
      if (k === "del") return a.slice(0, -1);
      if (k === ".") return a.includes(".") || a === "" ? a : a + ".";
      const [, dec] = a.split(".");
      if (dec !== undefined && dec.length >= 2) return a; // cents are full
      if (a.replace(".", "").length >= 6) return a; // five figures is plenty
      return a + k;
    });
  };

  return (
    <>
      {/* The display: one giant money moment, glowing once it's chargeable. */}
      <View style={styles.display}>
        <Text style={styles.displayLabel}>CHARGE</Text>
        <Text style={[styles.displayAmount, hasAmount && styles.displayAmountLive]}>
          {amount ? `$${amount}` : "$0"}
        </Text>
        <View style={styles.readerRow}>
          <View style={[styles.readerDot, { backgroundColor: connectedReader ? theme.good : theme.textFaint }]} />
          <Text style={styles.readerText}>
            {connectedReader ? "Reader ready" : "Reader wakes on first charge"}
          </Text>
        </View>
      </View>

      {artists.length > 0 && (
        <Chips
          label="For"
          value={who}
          options={["shop", ...artists.map((a) => a.id)]}
          display={(id) => (id === "shop" ? "Shop" : artists.find((a) => a.id === id)?.name ?? id)}
          onChange={setWho}
        />
      )}

      {__DEV__ && !connectedReader && (
        <Chips
          label="Reader (dev only — test mode declines real cards)"
          value={simulated ? "simulated" : "real"}
          options={["real", "simulated"]}
          display={(v) => (v === "real" ? "Real tap" : "Simulated tap")}
          onChange={(v) => setSimulated(v === "simulated")}
        />
      )}

      {/* Keypad — the phone IS the register, no system keyboard. */}
      <View style={styles.pad}>
        {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "del"]].map((row) => (
          <View key={row[0]} style={styles.padRow}>
            {row.map((k) => (
              <Pressable
                key={k}
                onPress={() => press(k)}
                onLongPress={k === "del" ? () => setAmount("") : undefined}
                disabled={busy}
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed, busy && { opacity: 0.4 }]}
              >
                <Text style={styles.keyText}>{k === "del" ? "⌫" : k}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* Tip — turn the phone to the client. Off the service amount; goes to the
          artist in full. Hidden for shop/merch sales (no artist to tip). */}
      {tippable && hasAmount && !busy && (
        <View style={styles.tipWrap}>
          <Text style={styles.tipLabel}>
            Add a tip{whoName ? ` for ${whoName}` : ""}
          </Text>
          <View style={styles.tipRow}>
            {TIP_PRESETS.map((p) => {
              const on = tipPct === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    picked();
                    setTipPct(on ? null : p);
                  }}
                  style={[styles.tipChip, on && styles.tipChipOn]}
                >
                  <Text style={[styles.tipChipText, on && styles.tipChipTextOn]}>{p}%</Text>
                  <Text style={[styles.tipChipSub, on && styles.tipChipTextOn]}>
                    {money(Math.round((cents * p) / 100))}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                picked();
                setTipPct(tipPct === "custom" ? null : "custom");
              }}
              style={[styles.tipChip, tipPct === "custom" && styles.tipChipOn]}
            >
              <Text style={[styles.tipChipText, tipPct === "custom" && styles.tipChipTextOn]}>Other</Text>
            </Pressable>
          </View>
          {tipPct === "custom" && (
            <View style={styles.tipCustomRow}>
              <Text style={styles.tipDollar}>$</Text>
              <TextInput
                value={tipCustom}
                onChangeText={(t) => setTipCustom(t.replace(/[^\d.]/g, ""))}
                placeholder="0"
                placeholderTextColor={theme.textFaint}
                keyboardType="numeric"
                style={styles.tipCustomInput}
                autoFocus
              />
              <Text style={styles.tipCustomHint}>tip amount</Text>
            </View>
          )}
          {tipCents > 0 && (
            <Text style={styles.tipSummary}>
              {money(cents)} + {money(tipCents)} tip
            </Text>
          )}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ height: 14 }} />
      <Button
        label={
          phase === "connecting"
            ? "Waking the reader…"
            : phase === "collecting"
              ? "Tap the card on this phone…"
              : hasAmount
                ? `Charge ${money(totalCents)}`
                : "Enter an amount"
        }
        onPress={take}
        disabled={busy || !hasAmount}
      />
      {busy && <ActivityIndicator color={theme.brand} style={{ marginTop: 16 }} />}
      <Text style={styles.note}>
        Card collected on this phone — nothing is typed. The shop&apos;s cut comes off
        automatically; the rest is yours.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  display: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: 22,
    marginBottom: 16,
  },
  displayLabel: {
    color: theme.textFaint,
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: "700",
  },
  displayAmount: {
    color: theme.textFaint,
    fontSize: 64,
    fontWeight: "800",
    letterSpacing: -1.5,
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },
  displayAmountLive: {
    color: theme.text,
    textShadowColor: "rgba(255,20,147,0.55)",
    textShadowRadius: 18,
  },
  readerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  readerDot: { width: 7, height: 7, borderRadius: 4 },
  readerText: { color: theme.textFaint, fontSize: 12 },
  pad: { gap: 10, marginTop: 6 },
  padRow: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  keyPressed: { backgroundColor: theme.surfaceRaised, borderColor: theme.brandBorder },
  keyText: { color: theme.text, fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"] },
  note: { color: theme.textFaint, fontSize: 12, marginTop: 14, lineHeight: 17 },
  error: { color: theme.bad, marginTop: 14, fontSize: 14 },
  tipWrap: { marginTop: 18 },
  tipLabel: { color: theme.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600", marginBottom: 8 },
  tipRow: { flexDirection: "row", gap: 8 },
  tipChip: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
  },
  tipChipOn: { backgroundColor: theme.brand, borderColor: theme.brand },
  tipChipText: { color: theme.text, fontSize: 15, fontWeight: "700" },
  tipChipTextOn: { color: "#fff" },
  tipChipSub: { color: theme.textFaint, fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"] },
  tipCustomRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  tipDollar: { color: theme.textDim, fontSize: 20, fontWeight: "700" },
  tipCustomInput: {
    minWidth: 90,
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    borderBottomColor: theme.borderStrong,
    borderBottomWidth: 1,
    paddingVertical: 2,
  },
  tipCustomHint: { color: theme.textFaint, fontSize: 12 },
  tipSummary: { color: theme.textDim, fontSize: 13, marginTop: 10, fontVariant: ["tabular-nums"] },
  doneCheck: { color: theme.good, fontSize: 40, textAlign: "center" },
  doneTitle: { color: theme.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: 8 },
  doneSub: { color: theme.textDim, fontSize: 14, textAlign: "center", marginTop: 6 },
});
