import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { snapCash } from "@/lib/vision";
import { theme, money } from "@/lib/theme";
import { Badge, Button, Card, Empty, ListRow, SectionTitle, Stat } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";

// Cash log (parity with /admin/cash): quick drawer entries from the counter.
// Negative amounts are payouts/drops; reconciliation stays on the web.

type Entry = {
  id: string;
  date: string;
  amount_cents: number;
  note: string;
  reconciled: boolean;
  artists: { name: string } | null;
};
type Artist = { id: string; name: string };

export default function Cash() {
  const insets = useSafeAreaInsets();
  const { email } = useAuth();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [who, setWho] = useState("shop");
  const [busy, setBusy] = useState(false);
  const [counting, setCounting] = useState(false);
  const [countNote, setCountNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: a }] = await Promise.all([
      supabase
        .from("cash_entries")
        .select("id, date, amount_cents, note, reconciled, artists(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.from("artists").select("id, name").eq("active", true).order("sort"),
    ]);
    setRows((data ?? []) as unknown as Entry[]);
    setArtists((a ?? []) as Artist[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const save = async () => {
    const cents = Math.round(Number(amount) * 100);
    if (!cents) return;
    setBusy(true);
    await supabase.from("cash_entries").insert({
      amount_cents: cents,
      note: note.trim(),
      artist_id: who === "shop" ? null : who,
      entered_by: email,
    });
    setBusy(false);
    setAmount("");
    setNote("");
    setAdding(false);
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = (rows ?? []).filter((r) => r.date === today).reduce((a, r) => a + r.amount_cents, 0);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Cash log", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Stat label="Cash today" value={money(todayTotal)} hero />

            <View style={{ marginTop: 14 }}>
              <Button label={adding ? "Cancel" : "Log cash"} tone={adding ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />
            </View>

            {adding && (
              <Card style={{ marginTop: 14 }}>
                <LabeledInput label="Amount ($, negative for payouts/drops)" value={amount} onChange={setAmount} keyboardType="numeric" placeholder="120" />
                <View style={{ marginBottom: 12 }}>
                  <Button
                    label={counting ? "Counting…" : "Count with the camera"}
                    tone="ghost"
                    disabled={counting}
                    onPress={async () => {
                      setCounting(true);
                      setCountNote(null);
                      const r = await snapCash();
                      setCounting(false);
                      if (!r.ok || !r.cash) {
                        if (r.error !== "canceled") setCountNote(r.error ?? "Could not read the photo.");
                        return;
                      }
                      const breakdown = r.cash.stacks
                        .sort((a, b) => b.denominationCents - a.denominationCents)
                        .map((s) => `${s.count}×$${s.denominationCents / 100}`)
                        .join(" + ");
                      setAmount(String(r.cash.totalCents / 100));
                      if (breakdown && !note.trim()) setNote(`counted: ${breakdown}`);
                      setCountNote(
                        [breakdown ? `Saw ${breakdown} = ${money(r.cash.totalCents)}` : "No bills found.", r.cash.caveat]
                          .filter(Boolean)
                          .join(" — "),
                      );
                    }}
                  />
                  {countNote ? (
                    <Text style={{ color: theme.warn, fontSize: 12.5, marginTop: 8, lineHeight: 17 }}>
                      {countNote} Double-check before saving.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 8, gap: 3 }}>
                      <Text style={{ color: theme.textFaint, fontSize: 12, lineHeight: 17 }}>
                        ▪ Lay the bills flat on the counter — no overlapping, no stacks
                      </Text>
                      <Text style={{ color: theme.textFaint, fontSize: 12, lineHeight: 17 }}>
                        ▪ Shoot from straight above with every bill in frame
                      </Text>
                      <Text style={{ color: theme.textFaint, fontSize: 12, lineHeight: 17 }}>
                        ▪ It only counts what it can see — check the total before saving
                      </Text>
                    </View>
                  )}
                </View>
                <Chips
                  label="For"
                  value={who}
                  options={["shop", ...artists.map((a) => a.id)]}
                  display={(id) => (id === "shop" ? "Shop" : artists.find((a) => a.id === id)?.name ?? id)}
                  onChange={setWho}
                />
                <LabeledInput label="Note" value={note} onChange={setNote} placeholder="walk-in flash, cash tip…" />
                <Button label={busy ? "Saving…" : "Save entry"} onPress={save} disabled={busy} />
              </Card>
            )}

            <SectionTitle>Recent</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {rows.length === 0 ? (
                <Empty>No cash entries yet.</Empty>
              ) : (
                rows.map((r, i) => (
                  <ListRow
                    key={r.id}
                    first={i === 0}
                    title={`${money(r.amount_cents)}  ·  ${r.artists?.name ?? "Shop"}`}
                    sub={`${r.date}${r.note ? ` · ${r.note}` : ""}`}
                    right={<Badge label={r.reconciled ? "Reconciled" : "Open"} tone={r.reconciled ? "good" : "neutral"} />}
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
