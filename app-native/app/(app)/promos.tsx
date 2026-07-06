import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { Badge, Button, Card, Empty, SectionTitle } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";
import InkWash from "@/components/InkWash";
import { uid } from "@/lib/ids";
import { success, trouble } from "@/lib/haptics";

// Artist-run promos. Spin one up ("Flash Friday — 20% off all weekend"), it
// goes live on your public page instantly (the page your QR card points at),
// and the caption is one tap from your clipboard for stories and DMs. Text
// blasts to clients come later — Twilio and consent copy still gate outbound.

const SITE = (process.env.EXPO_PUBLIC_API_URL ?? "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");

type Campaign = {
  id: string;
  title: string;
  offer: string;
  pct_off: number | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
};

const PCTS = ["10", "15", "20", "25", "none"] as const;
const RUNS = [
  { key: "weekend", label: "This weekend" },
  { key: "1w", label: "1 week" },
  { key: "2w", label: "2 weeks" },
  { key: "1m", label: "1 month" },
  { key: "open", label: "Until I end it" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const prettyDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// "This weekend" = through the coming Sunday (or today if it IS Sunday).
function endsFor(run: string): string | null {
  const now = new Date();
  if (run === "open") return null;
  if (run === "weekend") {
    const d = new Date(now);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return localDate(d);
  }
  const days = run === "1w" ? 7 : run === "2w" ? 14 : 30;
  return localDate(new Date(now.getTime() + days * 86_400_000));
}

export default function Promos() {
  const insets = useSafeAreaInsets();
  const { email } = useAuth();
  const { preview } = usePreview();
  const [me, setMe] = useState<{ id: string; slug: string; name: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [offer, setOffer] = useState("");
  const [pct, setPct] = useState<(typeof PCTS)[number]>("20");
  const [run, setRun] = useState<(typeof RUNS)[number]["key"]>("weekend");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (artistId: string) => {
    const { data } = await supabase
      .from("artist_campaigns")
      .select("id, title, offer, pct_off, ends_at, active, created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(30);
    setRows((data ?? []) as Campaign[]);
  }, []);

  useEffect(() => {
    (async () => {
      let artistId = preview?.artistId ?? null;
      if (!artistId && email) {
        const { data: p } = await supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle();
        artistId = (p?.artist_id as string | null) ?? null;
      }
      if (!artistId) {
        setMissing(true);
        return;
      }
      const { data: a } = await supabase.from("artists").select("id, slug, name").eq("id", artistId).maybeSingle();
      if (!a) {
        setMissing(true);
        return;
      }
      setMe(a as { id: string; slug: string; name: string });
      load(a.id);
    })();
  }, [email, preview, load]);

  const goLive = async () => {
    if (!me) return;
    if (!offer.trim()) {
      setErr("Say what the deal is — that line is the promo.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("artist_campaigns").insert({
      id: `cmp-${uid()}`,
      artist_id: me.id,
      title: title.trim(),
      offer: offer.trim(),
      pct_off: pct === "none" ? null : Number(pct),
      ends_at: endsFor(run),
      active: true,
    });
    setBusy(false);
    if (error) {
      trouble();
      setErr(error.message);
      return;
    }
    success();
    setAdding(false);
    setTitle("");
    setOffer("");
    setNote("Live on your page.");
    load(me.id);
  };

  const endIt = async (c: Campaign) => {
    if (!me) return;
    setRows((p) => (p ?? []).map((r) => (r.id === c.id ? { ...r, active: false } : r)));
    const { error } = await supabase.from("artist_campaigns").update({ active: false }).eq("id", c.id);
    if (error) load(me.id);
  };

  const share = async (c: Campaign) => {
    if (!me) return;
    const bits = [
      c.title && c.offer ? `${c.title}: ${c.offer}` : c.title || c.offer,
      c.ends_at ? `Through ${prettyDay(c.ends_at)}.` : "",
      `Book me: ${SITE}/${me.slug}`,
    ].filter(Boolean);
    await Clipboard.setStringAsync(bits.join(" "));
    success();
    setNote("Caption copied — paste it into a story or DM.");
  };

  const expired = (c: Campaign) => !!c.ends_at && c.ends_at < localDate(new Date());
  const live = (c: Campaign) => c.active && !expired(c);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Promos", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <InkWash />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
          {missing ? (
            <Card>
              <Text style={styles.emptyText}>
                No public page is tied to this login yet — the shop can link you on Artists &amp; Pay.
              </Text>
            </Card>
          ) : !me || rows === null ? (
            <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Button label={adding ? "Cancel" : "New promo"} tone={adding ? "ghost" : "brand"} onPress={() => { setNote(null); setAdding((v) => !v); }} />

              {adding && (
                <Card style={{ marginTop: 14 }}>
                  <LabeledInput label="Name (optional)" value={title} onChange={setTitle} placeholder="Flash Friday" />
                  <LabeledInput label="The deal" value={offer} onChange={setOffer} placeholder="20% off flash all weekend" />
                  <Chips
                    label="% off (for your own math)"
                    value={pct}
                    options={[...PCTS]}
                    display={(v) => (v === "none" ? "Skip" : `${v}%`)}
                    onChange={setPct}
                  />
                  <Chips
                    label="Runs"
                    value={run}
                    options={RUNS.map((r) => r.key)}
                    display={(k) => RUNS.find((r) => r.key === k)?.label ?? k}
                    onChange={setRun}
                  />
                  {err && <Text style={styles.err}>{err}</Text>}
                  <Button label={busy ? "Publishing…" : "Go live on my page"} onPress={goLive} disabled={busy} />
                  <Text style={styles.hint}>
                    Goes straight onto {SITE.replace(/^https?:\/\//, "")}/{me.slug} — the page your QR card opens.
                  </Text>
                </Card>
              )}

              {note && <Text style={styles.note}>{note}</Text>}

              <SectionTitle>Your promos</SectionTitle>
              <Card style={{ padding: 0 }}>
                {rows.length === 0 ? (
                  <Empty>Nothing running. A weekend flash deal is a good first one.</Empty>
                ) : (
                  rows.map((c, i) => (
                    <View key={c.id} style={[styles.row, i > 0 && styles.border]}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.rowTitle}>{c.title || c.offer}</Text>
                        {c.title ? <Text style={styles.rowSub}>{c.offer}</Text> : null}
                        <Text style={styles.rowMeta}>
                          {live(c)
                            ? c.ends_at
                              ? `Live through ${prettyDay(c.ends_at)}`
                              : "Live until you end it"
                            : expired(c) && c.active
                              ? `Ran through ${prettyDay(c.ends_at!)}`
                              : "Ended"}
                        </Text>
                        {live(c) && (
                          <View style={styles.actions}>
                            <Pressable onPress={() => share(c)} style={styles.act}>
                              <Text style={styles.actText}>Copy caption</Text>
                            </Pressable>
                            <Pressable onPress={() => endIt(c)} style={styles.act}>
                              <Text style={styles.actText}>End it</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                      <Badge label={live(c) ? "Live" : "Done"} tone={live(c) ? "good" : "neutral"} />
                    </View>
                  ))
                )}
              </Card>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  err: { color: theme.bad, fontSize: 13, marginBottom: 10 },
  note: { color: theme.good, fontSize: 13.5, marginTop: 12, textAlign: "center" },
  hint: { color: theme.textFaint, fontSize: 12, marginTop: 12, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "flex-start", padding: 14 },
  border: { borderTopColor: theme.border, borderTopWidth: 1 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  rowSub: { color: theme.textDim, fontSize: 13.5, marginTop: 2 },
  rowMeta: { color: theme.textFaint, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  act: { borderColor: theme.border, borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 },
  actText: { color: theme.text, fontSize: 13, fontWeight: "600" },
  emptyText: { color: theme.textDim, fontSize: 14.5, lineHeight: 21 },
});
