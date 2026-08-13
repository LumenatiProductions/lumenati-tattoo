import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/appApi";
import { capture, snapCash } from "@/lib/vision";
import { success } from "@/lib/haptics";
import { theme, money } from "@/lib/theme";
import InkWash from "@/components/InkWash";
import { ActionPill, Badge, Button, Card, Empty, ListRow, SectionTitle, Stat } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";
import RebookCard from "@/components/RebookCard";
import { todayLocal } from "@/lib/dates";

// Cash is a handoff board now (page-walk note 12), not a drawer log.
// The dollar gets handled once: the artist logs it at the chair (close-out),
// taps "Handed off" when they pass the stack, the admin taps "Got it" — and
// the page shows where every cash dollar physically is: at a chair, in
// transit, or in the box. Reconciliation is just confirming the box count.

type Entry = {
  id: string;
  date: string;
  amount_cents: number;
  note: string;
  reconciled: boolean;
  artist_id: string | null;
  handed_off_at: string | null;
  received_at: string | null;
  rent_invoice_id: string | null;
  artists: { name: string } | null;
};
type Artist = { id: string; name: string };

export default function Cash() {
  const insets = useSafeAreaInsets();
  const { role, email, shopId } = useAuth();
  const { preview } = usePreview();
  // "View as artist" scopes this to that one chair's cash (lum-024).
  const isAdmin = role === "owner" && !preview;
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [myArtistId, setMyArtistId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [who, setWho] = useState("shop");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counting, setCounting] = useState(false);
  const [countNote, setCountNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A positive artist entry is a client paying — the paid moment. Holds that
  // artist's id so the rebook ask appears right after the save.
  const [rebookFor, setRebookFor] = useState<string | null>(null);

  useEffect(() => {
    if (preview) {
      setMyArtistId(preview.artistId);
      return;
    }
    if (role === "owner" || !email) return; // real owner has no chair
    supabase
      .from("profiles")
      .select("artist_id")
      .eq("email", email)
      .maybeSingle()
      .then(({ data }) => setMyArtistId((data?.artist_id as string | null) ?? null));
  }, [role, email, preview]);
  const effectiveArtistId = preview?.artistId ?? myArtistId;

  const load = useCallback(async () => {
    if (!shopId) return;
    const [{ data }, { data: a }] = await Promise.all([
      supabase
        .from("cash_entries")
        .select("id, date, amount_cents, note, reconciled, artist_id, handed_off_at, received_at, rent_invoice_id, artists(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("artists").select("id, name").eq("shop_id", shopId!).eq("active", true).order("sort"),
    ]);
    setRows((data ?? []) as unknown as Entry[]);
    setArtists((a ?? []) as Artist[]);
  }, [shopId]);

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
      // Logged at the counter by the admin = it's already in the box.
      received_at: new Date().toISOString(),
      received_by: email,
    });
    setBusy(false);
    setAmount("");
    setNote("");
    setAdding(false);
    setRebookFor(cents > 0 && who !== "shop" ? who : null);
    load();
  };

  const handOff = async (r: Entry) => {
    setBusyId(r.id);
    setErr(null);
    const { error } = await supabase
      .from("cash_entries")
      .update({ handed_off_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    success();
    load();
  };

  const receive = async (r: Entry, imageBase64?: string) => {
    setBusyId(r.id);
    setErr(null);
    const res = await apiPost<{ rentPaid: boolean }>("/api/cash/receive", {
      entryId: r.id,
      ...(imageBase64 ? { imageBase64 } : {}),
    });
    setBusyId(null);
    if (!res.ok) {
      setErr(res.error ?? "Could not mark it received.");
      return;
    }
    success();
    load();
  };

  // Got it, with the optional snap-the-stack (note 13) — proof lives on the line.
  const gotIt = (r: Entry) => {
    Alert.alert(`Got ${money(r.amount_cents)}?`, "Snap the stack for the record, or just confirm.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Snap + confirm",
        onPress: async () => {
          const img = await capture();
          await receive(r, img?.base64);
        },
      },
      { text: "Got it", onPress: () => receive(r) },
    ]);
  };

  // Artist view (incl. preview) sees only their own cash. RLS already narrows a
  // real artist, so this only trims the owner's preview to the chosen chair.
  const all = isAdmin ? (rows ?? []) : (rows ?? []).filter((r) => r.artist_id === effectiveArtistId);
  const atChairs = all.filter((r) => !r.handed_off_at && !r.received_at && r.artist_id);
  const inTransit = all.filter((r) => r.handed_off_at && !r.received_at);
  const inBox = all.filter((r) => r.received_at && !r.reconciled);
  const sum = (xs: Entry[]) => xs.reduce((a, r) => a + r.amount_cents, 0);
  const today = todayLocal();
  const todayTotal = all.filter((r) => r.date === today).reduce((a, r) => a + r.amount_cents, 0);

  const rowTitle = (r: Entry) => `${money(r.amount_cents)}  ·  ${r.artists?.name ?? "Shop"}`;
  const rowSub = (r: Entry) => `${r.date}${r.note ? ` · ${r.note}` : ""}`;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: isAdmin ? "Shop cash" : "My cash", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <InkWash />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : isAdmin ? (
          <>
            {/* The box, live: what's been received and not yet counted down. */}
            <Stat label="In the box" value={money(sum(inBox))} hero sub={`${money(todayTotal)} moved today`} />

            <SectionTitle>Incoming, tap when the stack is in your hand</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {inTransit.length === 0 ? (
                <Empty>Nothing in transit.</Empty>
              ) : (
                inTransit.map((r, i) => (
                  <ListRow
                    key={r.id}
                    first={i === 0}
                    title={rowTitle(r)}
                    sub={rowSub(r)}
                    right={<ActionPill label={busyId === r.id ? "…" : "Got it"} onPress={() => gotIt(r)} />}
                  />
                ))
              )}
            </Card>

            <SectionTitle>Still at the chairs</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {atChairs.length === 0 ? (
                <Empty>Nothing outstanding with artists.</Empty>
              ) : (
                atChairs.map((r, i) => (
                  <ListRow key={r.id} first={i === 0} title={rowTitle(r)} sub={rowSub(r)} right={<Badge label="with artist" tone="warn" />} />
                ))
              )}
            </Card>

            <View style={{ marginTop: 14 }}>
              <Button
                label={adding ? "Cancel" : "Log cash at the counter"}
                tone={adding || rebookFor ? "ghost" : "brand"}
                onPress={() => {
                  setRebookFor(null);
                  setAdding((v) => !v);
                }}
              />
            </View>

            {rebookFor && !adding && <RebookCard artistId={rebookFor} />}

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
                          .join(" · "),
                      );
                    }}
                  />
                  {countNote ? (
                    <Text style={{ color: theme.warn, fontSize: 12.5, marginTop: 8, lineHeight: 17 }}>
                      {countNote} Double-check before saving.
                    </Text>
                  ) : null}
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
              {all.length === 0 ? (
                <Empty>No cash entries yet.</Empty>
              ) : (
                all.slice(0, 20).map((r, i) => (
                  <ListRow
                    key={r.id}
                    first={i === 0}
                    title={rowTitle(r)}
                    sub={rowSub(r)}
                    right={
                      <Badge
                        label={r.reconciled ? "Reconciled" : r.received_at ? "In the box" : r.handed_off_at ? "In transit" : "With artist"}
                        tone={r.reconciled || r.received_at ? "good" : "neutral"}
                      />
                    }
                  />
                ))
              )}
            </Card>
          </>
        ) : (
          <>
            {/* The artist's side of the board: what they're physically holding
                for the shop. Cash gets logged at the register close-out. */}
            <Stat label="You're holding for the shop" value={money(sum(atChairs))} hero warn={sum(atChairs) > 0} />

            <SectionTitle>Hand these to an admin</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {atChairs.length === 0 ? (
                <Empty>Nothing to hand off. Log cash on Take payment when a client pays.</Empty>
              ) : (
                atChairs.map((r, i) => (
                  <ListRow
                    key={r.id}
                    first={i === 0}
                    title={rowTitle(r)}
                    sub={rowSub(r)}
                    right={<ActionPill label={busyId === r.id ? "…" : "Handed off"} onPress={() => handOff(r)} />}
                  />
                ))
              )}
            </Card>

            <SectionTitle>Waiting on the admin&apos;s tap</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {inTransit.length === 0 ? (
                <Empty>Nothing in transit.</Empty>
              ) : (
                inTransit.map((r, i) => (
                  <ListRow key={r.id} first={i === 0} title={rowTitle(r)} sub={rowSub(r)} right={<Badge label="in transit" tone="neutral" />} />
                ))
              )}
            </Card>

            <SectionTitle>Settled</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {all.filter((r) => r.received_at).length === 0 ? (
                <Empty>Nothing settled yet.</Empty>
              ) : (
                all
                  .filter((r) => r.received_at)
                  .slice(0, 10)
                  .map((r, i) => (
                    <ListRow key={r.id} first={i === 0} title={rowTitle(r)} sub={rowSub(r)} right={<Badge label="received" tone="good" />} />
                  ))
              )}
            </Card>
          </>
        )}
        {err ? <Text style={{ color: theme.bad, fontSize: 13, marginTop: 10 }}>{err}</Text> : null}
      </ScrollView>
    </>
  );
}
