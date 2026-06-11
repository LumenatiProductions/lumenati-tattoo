import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { apiGet, apiPost } from "@/lib/appApi";
import { theme, money } from "@/lib/theme";
import { Badge, Card, Empty, SectionTitle, Stat } from "@/components/ui";

// Payouts & settlement (parity with /admin/payouts). Statements are computed
// from the sales mirror AFTER each artist's latest settlement, exactly like the
// web: card money the shop holds minus the shop's cut on cash and unpaid rent.
// "Mark settled" goes through /api/settlements (Bearer) so the receipt email
// still sends.

type ArtistRow = {
  id: string;
  name: string;
  pay_type: string;
  rent_cents: number | null;
  split_pct: number | string | null;
};
type SaleRow = {
  artist_id: string | null;
  service_cents: number | null;
  tip_cents: number | null;
  method: string | null;
  created_at: string | null;
};
type Statement = {
  artist: ArtistRow;
  cardService: number;
  cardTips: number;
  cashService: number;
  rentOwed: number;
  net: number; // >0 shop pays artist, <0 artist pays shop
};

function statementFor(
  artist: ArtistRow,
  sales: SaleRow[],
  rentOwedByArtist: Record<string, number>,
  since: string | undefined,
): Statement {
  const split = Number(artist.split_pct ?? 0);
  let cardService = 0,
    cardTips = 0,
    cashService = 0;
  for (const s of sales) {
    if (s.artist_id !== artist.id) continue;
    if (since && (s.created_at ?? "").slice(0, 10) <= since) continue;
    if (s.method === "cash") {
      cashService += s.service_cents ?? 0;
    } else {
      cardService += s.service_cents ?? 0;
      cardTips += s.tip_cents ?? 0;
    }
  }
  const rentOwed = rentOwedByArtist[artist.id] ?? 0;
  const shopOwesArtist = Math.round(cardService * (1 - split)) + cardTips;
  const artistOwesShop = Math.round(cashService * split) + rentOwed;
  return { artist, cardService, cardTips, cashService, rentOwed, net: shopOwesArtist - artistOwesShop };
}

export default function Payouts() {
  const insets = useSafeAreaInsets();
  const { role, email } = useAuth();
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [settleConfigured, setSettleConfigured] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSettle = role === "owner" || role === "bookkeeper";

  const load = useCallback(async () => {
    const [{ data: artists }, { data: sales }, { data: rent }, settle, mine] = await Promise.all([
      supabase.from("artists").select("id, name, pay_type, rent_cents, split_pct").eq("active", true).order("sort"),
      supabase
        .from("sales")
        .select("artist_id, service_cents, tip_cents, method, created_at")
        .order("created_at", { ascending: false })
        .limit(3000),
      supabase.from("rent_invoices").select("artist_id, amount_cents").eq("status", "pending"),
      apiGet<{ configured: boolean; settledThrough: Record<string, string> }>("/api/settlements"),
      role === "artist" && email
        ? supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const rentOwed: Record<string, number> = {};
    for (const r of rent ?? []) {
      rentOwed[r.artist_id] = (rentOwed[r.artist_id] ?? 0) + (r.amount_cents ?? 0);
    }
    const settledThrough = settle.ok ? settle.data?.settledThrough ?? {} : {};
    setSettleConfigured(settle.ok && settle.data?.configured === true);

    const myArtistId = (mine?.data as { artist_id?: string | null } | null)?.artist_id ?? null;
    const visible = (artists ?? []).filter((a) => (role === "artist" ? a.id === myArtistId : true));
    setStatements(
      visible.map((a) => statementFor(a as ArtistRow, (sales ?? []) as SaleRow[], rentOwed, settledThrough[a.id])),
    );
  }, [role, email]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const settle = (st: Statement, kind: "pay" | "collect") => {
    const verb = kind === "pay" ? "paid out" : "collected";
    Alert.alert(
      "Mark settled",
      `Record that ${money(Math.abs(st.net))} was ${verb} and settle ${st.artist.name} through today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle",
          style: "default",
          onPress: async () => {
            setBusyId(st.artist.id);
            setMsg(null);
            const res = await apiPost<{ receipt?: { sent: boolean; reason?: string } }>("/api/settlements", {
              artistId: st.artist.id,
              amountCents: st.net,
              note: `card ${money(st.cardService)} svc + ${money(st.cardTips)} tips · cash cut ${money(
                Math.round(st.cashService * Number(st.artist.split_pct ?? 0)),
              )}${st.rentOwed ? ` · rent ${money(st.rentOwed)}` : ""}`,
            });
            setBusyId(null);
            if (!res.ok) {
              setMsg(res.error ?? "Could not record that settlement.");
              return;
            }
            setMsg(
              res.data?.receipt?.sent
                ? `${st.artist.name} settled through today — receipt emailed.`
                : `${st.artist.name} settled through today.`,
            );
            load();
          },
        },
      ],
    );
  };

  const pays = (statements ?? []).filter((s) => s.net > 0).sort((a, b) => b.net - a.net);
  const collects = (statements ?? []).filter((s) => s.net < 0).sort((a, b) => a.net - b.net);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Payouts", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
      >
        {statements === null ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            {role !== "artist" && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Stat label="To pay artists" value={money(pays.reduce((a, s) => a + s.net, 0))} hero />
                <Stat label="To collect" value={money(collects.reduce((a, s) => a - s.net, 0))} />
                <Stat label="To settle" value={String(pays.length + collects.length)} />
              </View>
            )}

            {msg ? <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 12 }}>{msg}</Text> : null}

            <SectionTitle>Shop pays out</SectionTitle>
            <Card>
              {pays.length === 0 ? (
                <Empty>Nobody to pay right now.</Empty>
              ) : (
                pays.map((s, i) => (
                  <StatementRow
                    key={s.artist.id}
                    st={s}
                    kind="pay"
                    first={i === 0}
                    busy={busyId === s.artist.id}
                    canSettle={canSettle && settleConfigured}
                    onSettle={() => settle(s, "pay")}
                  />
                ))
              )}
            </Card>

            <SectionTitle>Shop collects</SectionTitle>
            <Card>
              {collects.length === 0 ? (
                <Empty>Nothing to collect.</Empty>
              ) : (
                collects.map((s, i) => (
                  <StatementRow
                    key={s.artist.id}
                    st={s}
                    kind="collect"
                    first={i === 0}
                    busy={busyId === s.artist.id}
                    canSettle={canSettle && settleConfigured}
                    onSettle={() => settle(s, "collect")}
                  />
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

function StatementRow({
  st,
  kind,
  first,
  busy,
  canSettle,
  onSettle,
}: {
  st: Statement;
  kind: "pay" | "collect";
  first: boolean;
  busy: boolean;
  canSettle: boolean;
  onSettle: () => void;
}) {
  const split = Number(st.artist.split_pct ?? 0);
  const sub =
    kind === "pay"
      ? `card ${money(st.cardService)} svc + ${money(st.cardTips)} tips`
      : `cash cut ${money(Math.round(st.cashService * split))}${st.rentOwed ? ` + rent ${money(st.rentOwed)}` : ""}`;
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", paddingVertical: 13 },
        !first && { borderTopColor: theme.border, borderTopWidth: 1 },
      ]}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>{st.artist.name}</Text>
        <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 3 }}>{sub}</Text>
      </View>
      <Pressable
        onPress={canSettle ? onSettle : undefined}
        disabled={!canSettle || busy}
        style={({ pressed }) => [{ alignItems: "flex-end", gap: 8 }, pressed && { opacity: 0.7 }]}
      >
        <Text
          style={{
            color: kind === "pay" ? theme.warn : theme.good,
            fontSize: 17,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {money(Math.abs(st.net))}
        </Text>
        {canSettle && <Badge label={busy ? "Settling…" : "Mark settled"} tone="brand" />}
      </Pressable>
    </View>
  );
}
