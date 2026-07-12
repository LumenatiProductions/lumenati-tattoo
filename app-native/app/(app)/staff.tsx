import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type Role } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Badge, Button, Card, Empty, ListRow, SectionTitle } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";

// Staff & artists (parity with /admin/staff, owner only): the profiles table IS
// the allowlist — anyone here can sign in with their email; removing a row cuts
// web + app access immediately.

const ROLE_LABELS: Record<Role, string> = {
  owner: "Admin",
  artist: "Artist",
};
const ROLES = Object.keys(ROLE_LABELS) as Role[];

type Profile = { email: string; role: Role; artist_id: string | null; full_name: string | null };
type Artist = { id: string; name: string };

export default function Staff() {
  const insets = useSafeAreaInsets();
  const { role: myRole, email: myEmail, shopId } = useAuth();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("artist");
  const [artistId, setArtistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("email, role, artist_id, full_name").order("role"),
      supabase.from("artists").select("id, name").eq("shop_id", shopId!).eq("active", true).order("sort"),
    ]);
    setRows((p ?? []) as Profile[]);
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

  if (myRole !== "owner") {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Staff", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
        <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20 }}>
          <Card>
            <Empty>Admins only.</Empty>
          </Card>
        </View>
      </>
    );
  }

  const add = async () => {
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) {
      setMsg("Enter their sign-in email.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("profiles").upsert(
      {
        email: em,
        full_name: name.trim() || null,
        role,
        artist_id: role === "artist" ? artistId || artists[0]?.id || null : null,
      },
      { onConflict: "email" },
    );
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setEmail("");
    setName("");
    setAdding(false);
    setMsg("Added. They can sign in with that email now.");
    load();
  };

  const remove = (p: Profile) => {
    // Don't let the owner lock themselves out with one stray tap.
    if (p.email === myEmail) {
      setMsg("You can't remove yourself — have another owner do it.");
      return;
    }
    Alert.alert("Remove from team?", `${p.email} loses web + app access immediately.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("profiles").delete().eq("email", p.email);
          setMsg(error ? error.message : `${p.email} removed.`);
          load();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Staff", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textDim} />}
      >
        {rows === null ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Button label={adding ? "Cancel" : "Add someone"} tone={adding ? "ghost" : "brand"} onPress={() => setAdding((v) => !v)} />

            {adding && (
              <Card style={{ marginTop: 14 }}>
                <LabeledInput label="Email" value={email} onChange={setEmail} placeholder="them@example.com" keyboardType="email-address" autoCapitalize="none" />
                <LabeledInput label="Name (optional)" value={name} onChange={setName} placeholder="First Last" autoCapitalize="words" />
                <Chips label="Role" value={role} options={ROLES} display={(r) => ROLE_LABELS[r]} onChange={setRole} />
                {role === "artist" && (
                  <Chips
                    label="Whose page"
                    value={artistId || artists[0]?.id || ""}
                    options={artists.map((a) => a.id)}
                    display={(id) => artists.find((a) => a.id === id)?.name ?? id}
                    onChange={setArtistId}
                  />
                )}
                <Button label={busy ? "Adding…" : "Add to team"} onPress={add} disabled={busy} />
              </Card>
            )}

            {msg ? <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 12 }}>{msg}</Text> : null}

            <SectionTitle>Team</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {rows.length === 0 ? (
                <Empty>No one yet.</Empty>
              ) : (
                rows.map((p, i) => (
                  <ListRow
                    key={p.email}
                    first={i === 0}
                    title={p.full_name || p.email}
                    sub={[p.full_name ? p.email : null, p.artist_id ? artists.find((a) => a.id === p.artist_id)?.name : null]
                      .filter(Boolean)
                      .join(" · ")}
                    right={<Badge label={ROLE_LABELS[p.role] ?? p.role} tone="brand" />}
                    onPress={() => remove(p)}
                  />
                ))
              )}
            </Card>
            <Text style={{ color: theme.textFaint, fontSize: 12, marginTop: 10 }}>
              Tap a person to remove them.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}
