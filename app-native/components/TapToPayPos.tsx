import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useStripeTerminal, type Reader } from "@stripe/stripe-terminal-react-native";
import { theme, money } from "@/lib/theme";
import { Button, Card } from "@/components/ui";
import { Chips } from "@/components/form";
import { supabase } from "@/lib/supabase";
import { createTapToPayIntent, getLocationId } from "@/lib/terminal";
import Y2kPaidFX from "@/components/Y2kPaidFX";

// The real Tap to Pay flow (iOS, real builds only — pos.tsx gates rendering).
// One screen, one motion: type the amount, hit charge, client taps their card
// on the phone. The phone IS the reader: discover the built-in tapToPay
// reader, connect it to the shop's Terminal Location, then collect + confirm
// the server-minted destination-charge PaymentIntent.

type Phase = "idle" | "connecting" | "collecting" | "done";

export default function TapToPayPos() {
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [paidCents, setPaidCents] = useState(0);
  const [fx, setFx] = useState(false);
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [who, setWho] = useState("shop");
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
    supabase.from("artists").select("id, name").eq("active", true).order("sort")
      .then(({ data }) => setArtists((data ?? []) as { id: string; name: string }[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cents = Math.round((Number(amount) || 0) * 100);

  const ensureConnected = useCallback(async () => {
    if (connectedReader) return;
    setPhase("connecting");
    const locationId = await getLocationId();
    await discoverReaders({ discoveryMethod: "tapToPay", simulated: false });
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
  }, [connectedReader, discoverReaders, cancelDiscovering, connectReader]);

  const take = useCallback(async () => {
    if (cents < 50) return;
    setError(null);
    try {
      await ensureConnected();
      setPhase("collecting");
      const { clientSecret } = await createTapToPayIntent(cents, who === "shop" ? {} : { artistId: who });
      const ret = await retrievePaymentIntent(clientSecret);
      if (ret.error || !ret.paymentIntent) throw new Error(ret.error?.message || "Could not load the payment");
      const col = await collectPaymentMethod({ paymentIntent: ret.paymentIntent });
      if (col.error || !col.paymentIntent) throw new Error(col.error?.message || "Card not collected");
      const conf = await confirmPaymentIntent({ paymentIntent: col.paymentIntent });
      if (conf.error) throw new Error(conf.error.message);
      setPaidCents(cents);
      setFx(true);
      setPhase("done");
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setPhase("idle");
    }
  }, [cents, ensureConnected, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent]);

  if (phase === "done") {
    return (
      <>
      {fx && <Y2kPaidFX cents={paidCents} onDone={() => setFx(false)} />}
      <Card>
        <Text style={styles.doneCheck}>✓</Text>
        <Text style={styles.doneTitle}>Paid {money(paidCents)}</Text>
        <Text style={styles.doneSub}>Your split is on its way — cash out anytime.</Text>
        <View style={{ height: 14 }} />
        <Button label="New payment" tone="ghost" onPress={() => setPhase("idle")} />
      </Card>
      </>
    );
  }

  const busy = phase !== "idle";
  return (
    <>
      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountRow}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={theme.textFaint}
          keyboardType="numeric"
          style={styles.amountInput}
          autoFocus
          editable={!busy}
        />
      </View>

      {artists.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Chips
            label="For"
            value={who}
            options={["shop", ...artists.map((a) => a.id)]}
            display={(id) => (id === "shop" ? "Shop" : artists.find((a) => a.id === id)?.name ?? id)}
            onChange={setWho}
          />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ height: 18 }} />
      <Button
        label={
          phase === "connecting"
            ? "Waking the reader…"
            : phase === "collecting"
              ? "Tap the card on this phone…"
              : `Charge ${money(cents)}`
        }
        onPress={take}
        disabled={busy || cents < 50}
      />
      {busy && <ActivityIndicator color={theme.brand} style={{ marginTop: 16 }} />}
      <Text style={styles.note}>
        Card collected on this phone — nothing is typed. The shop&apos;s cut comes off
        automatically; the rest is yours.
        {connectedReader ? "  ▪ reader ready" : ""}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dollar: { color: theme.textDim, fontSize: 40, fontWeight: "700" },
  amountInput: { flex: 1, color: theme.text, fontSize: 56, fontWeight: "800", paddingVertical: 4 },
  note: { color: theme.textFaint, fontSize: 12, marginTop: 14, lineHeight: 17 },
  error: { color: theme.bad, marginTop: 14, fontSize: 14 },
  doneCheck: { color: theme.good, fontSize: 40, textAlign: "center" },
  doneTitle: { color: theme.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: 8 },
  doneSub: { color: theme.textDim, fontSize: 14, textAlign: "center", marginTop: 6 },
});
