import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { Badge, Button, Card, Empty, ListRow, SectionTitle } from "@/components/ui";
import { todayLocal } from "@/lib/dates";

// Follow-ups queue (parity with /admin/followups): see what's due or coming,
// pull a send forward to the next cron tick, or skip it. The actual sending
// stays server-side (the daily job) — "Send now" just makes it due.

type Row = {
  id: string;
  kind: string;
  channel: string;
  scheduled_for: string | null;
  status: string;
  clients: { first_name: string; last_name: string } | null;
};

const KIND_LABEL: Record<string, string> = {
  reminder_48h: "48h reminder",
  reminder_24h: "24h reminder",
  aftercare: "Aftercare",
  review_request: "Review ask",
  healed_photo: "Healed photo ask",
  rebook_nudge: "Rebook nudge",
  birthday: "Birthday",
};

export default function Followups() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("followups")
      .select("id, kind, channel, scheduled_for, status, clients(first_name, last_name)")
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(80);
    setRows((data ?? []) as unknown as Row[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const act = async (id: string, action: "now" | "skip") => {
    if (action === "now") {
      await supabase.from("followups").update({ scheduled_for: todayLocal() }).eq("id", id);
    } else {
      await supabase.from("followups").update({ status: "skipped", result: "skipped from app" }).eq("id", id);
    }
    load();
  };

  const today = todayLocal();
  const due = (rows ?? []).filter((r) => (r.scheduled_for ?? "") <= today);
  const upcoming = (rows ?? []).filter((r) => (r.scheduled_for ?? "") > today);

  const renderRow = (r: Row, i: number) => (
    <ListRow
      key={r.id}
      first={i === 0}
      title={r.clients ? `${r.clients.first_name} ${r.clients.last_name}` : "Client"}
      sub={`${KIND_LABEL[r.kind] ?? r.kind} · ${r.channel}${r.scheduled_for ? ` · ${r.scheduled_for}` : ""}`}
      right={
        <Text style={{ flexDirection: "row" }}>
          <Text onPress={() => act(r.id, "now")} style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>
            Send now
          </Text>
          <Text style={{ color: theme.textFaint }}>{"   "}</Text>
          <Text onPress={() => act(r.id, "skip")} style={{ color: theme.textDim, fontSize: 13.5, fontWeight: "600" }}>
            Skip
          </Text>
        </Text>
      }
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Follow-ups", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <SectionTitle right={<Badge label={`${due.length} due`} tone={due.length ? "warn" : "good"} />}>Due now</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {due.length === 0 ? <Empty>Nothing due, the queue is clear.</Empty> : due.map(renderRow)}
            </Card>

            <SectionTitle>Upcoming</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {upcoming.length === 0 ? <Empty>Nothing scheduled yet.</Empty> : upcoming.map(renderRow)}
            </Card>

            <Text style={{ color: theme.textFaint, fontSize: 12.5, marginTop: 16, lineHeight: 18 }}>
              Sends go out with the next automated run. "Send now" makes one due immediately.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}
