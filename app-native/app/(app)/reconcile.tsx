import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet } from "@/lib/appApi";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { Badge, Card, Empty, SectionTitle, Stat } from "@/components/ui";

// Reconciliation (parity with /admin/reconcile): Stripe's ledger next to our
// records for the current month, via /api/reconcile (Bearer) — the same server
// math as the web, no money logic duplicated here.

type Data = {
  month: string;
  stripe: {
    configured: boolean;
    availableCents?: number;
    pendingCents?: number;
    chargesCents?: number;
    feesCents?: number;
    payouts?: { id: string; date: string; amountCents: number; status: string }[];
    error?: string;
  };
  recorded: { paidCount: number; paidCents: number; pendingCount: number };
  square: { count: number; cardCents: number; cashCents: number };
  cash: {
    loggedCents: number;
    unreconciledCents: number;
    sessions: { openedAt: string; overShortCents: number | null }[];
  };
};

const usd = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Reconcile() {
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const allowed = role === "owner";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await apiGet<Data>("/api/reconcile");
    if (res.ok && res.data) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error ?? "Could not load reconciliation.");
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  // Same gate the server enforces (admins) — without it an artist
  // deep-linking here fires a doomed request and sees a raw fetch error.
  if (!allowed) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Reconciliation", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
        <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20 }}>
          <Card>
            <Empty>Admins only.</Empty>
          </Card>
        </View>
      </>
    );
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const diff =
    data?.stripe.configured && data.stripe.chargesCents !== undefined
      ? data.stripe.chargesCents - data.recorded.paidCents
      : null;
  const square = diff !== null && Math.abs(diff) < 100;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reconciliation", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {!data && !error ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : error ? (
          <Card>
            <Empty>{error}</Empty>
          </Card>
        ) : data ? (
          <>
            {/* The headline IS the diff: do the two sides agree? */}
            <Stat
              label="Difference (Stripe vs us)"
              value={diff === null ? "—" : usd(Math.abs(diff))}
              sub={diff === null ? "Stripe not connected" : square ? "square — books agree" : diff > 0 ? "Stripe has more" : "we have more"}
              warn={diff !== null && !square}
              hero
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <Stat
                label="Stripe charged"
                value={data.stripe.chargesCents !== undefined ? usd(data.stripe.chargesCents) : "—"}
                sub="per Stripe, this month"
              />
              <Stat
                label="We recorded"
                value={usd(data.recorded.paidCents)}
                sub={`${data.recorded.paidCount} paid payment${data.recorded.paidCount === 1 ? "" : "s"}`}
              />
              <Stat
                label="Stripe fees"
                value={data.stripe.feesCents !== undefined ? usd(data.stripe.feesCents) : "—"}
                sub="this month"
              />
              <Stat
                label="Cash unreconciled"
                value={usd(data.cash.unreconciledCents)}
                warn={data.cash.unreconciledCents > 0}
              />
            </View>

            <SectionTitle>Stripe</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {!data.stripe.configured ? (
                <Empty>Stripe isn't connected yet.</Empty>
              ) : data.stripe.error ? (
                <Empty>{data.stripe.error}</Empty>
              ) : (
                <>
                  <Row first title="Available" right={usd(data.stripe.availableCents ?? 0)} />
                  <Row title="Pending" right={usd(data.stripe.pendingCents ?? 0)} />
                  {(data.stripe.payouts ?? []).map((p) => (
                    <Row
                      key={p.id}
                      title={`Payout ${p.date}`}
                      right={usd(p.amountCents)}
                      badge={<Badge label={p.status} tone={p.status === "paid" ? "good" : "neutral"} />}
                    />
                  ))}
                </>
              )}
            </Card>

            <SectionTitle>Our records</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              <Row first title="Square card sales" right={usd(data.square.cardCents)} />
              <Row title="Square cash sales" right={usd(data.square.cashCents)} />
              <Row title="Cash logged" right={usd(data.cash.loggedCents)} />
            </Card>

            <SectionTitle>Drawer closes</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {data.cash.sessions.length === 0 ? (
                <Empty>No closed drawers yet.</Empty>
              ) : (
                data.cash.sessions.map((s, i) => {
                  const os = s.overShortCents ?? 0;
                  return (
                    <Row
                      key={i}
                      first={i === 0}
                      title={new Date(s.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      right={os === 0 ? "even" : `${os > 0 ? "+" : "−"}${usd(Math.abs(os))}`}
                      rightColor={os === 0 || os > 0 ? theme.good : theme.bad}
                    />
                  );
                })
              )}
            </Card>

            {data.recorded.pendingCount > 0 && (
              <Text style={{ color: theme.warn, fontSize: 13, marginTop: 14, lineHeight: 18 }}>
                {data.recorded.pendingCount} payment link{data.recorded.pendingCount === 1 ? "" : "s"} still
                pending — unpaid links are normal, but stale ones are worth voiding.
              </Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function Row({
  title,
  right,
  badge,
  rightColor,
  first,
}: {
  title: string;
  right: string;
  badge?: React.ReactNode;
  rightColor?: string;
  first?: boolean;
}) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
        !first && { borderTopColor: theme.border, borderTopWidth: 1 },
      ]}
    >
      <Text style={{ color: theme.textDim, fontSize: 14.5, flex: 1 }}>{title}</Text>
      {badge}
      <Text
        style={{
          color: rightColor ?? theme.text,
          fontSize: 15.5,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
          marginLeft: 8,
        }}
      >
        {right}
      </Text>
    </View>
  );
}
