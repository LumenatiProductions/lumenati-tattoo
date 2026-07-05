import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { Button, Card, SectionTitle } from "@/components/ui";
import { Chips, LabeledInput } from "@/components/form";

// My Room — edit your public page from your phone (tagline, bio, IG, song,
// accent, profile photo). Same room_content row the web editor writes; the
// public site re-renders on the next visit. Photo uploads land in the
// room-photos bucket, exactly like the web editor.

const SONGS: { id: string; label: string }[] = [
  { id: "offspring", label: "The Offspring" },
  { id: "goldfinger", label: "Goldfinger" },
  { id: "no-doubt", label: "No Doubt" },
  { id: "shorty", label: "A Day to Remember" },
  { id: "outkast", label: "Outkast" },
  { id: "blink182", label: "Blink-182" },
  { id: "manson", label: "Marilyn Manson" },
];
const COLORS = ["#FF1493", "#FFD700", "#7FFF00", "#1493FF", "#9b59b6", "#FF6347", "#00E0C0", "#FF8A00", "#B026FF"];

type Room = {
  artist_id: string;
  tagline: string;
  bio: string;
  ig_handle: string;
  song_id: string;
  accent_color: string;
  profile_photo: string;
};

type RosterArtist = { id: string; name: string; slug: string };

export default function MyRoom() {
  const { email, role } = useAuth();
  const { preview } = usePreview();
  const insets = useSafeAreaInsets();
  // Previewing = being that artist: their room only, no roster picker.
  const isOwner = role === "owner" && !preview;
  const [roster, setRoster] = useState<RosterArtist[]>([]);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Who can edit what: an artist edits their own room; a co-owner edits
  // anyone's (picker below — JD is both, so default to their own when linked).
  useEffect(() => {
    (async () => {
      if (!email) return;
      const [{ data: profile }, rosterRes] = await Promise.all([
        supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle(),
        isOwner
          ? supabase.from("artists").select("id, name, slug").eq("active", true).order("sort")
          : Promise.resolve({ data: null }),
      ]);
      const own = (profile?.artist_id as string | null) ?? null;
      const list = ((rosterRes.data ?? []) as RosterArtist[]) || [];
      setRoster(list);
      setArtistId(preview?.artistId ?? own ?? (isOwner ? list[0]?.id ?? null : null));
      setLoading(false);
    })();
  }, [email, isOwner, preview]);

  // Load the selected artist's room whenever the pick changes.
  useEffect(() => {
    (async () => {
      if (!artistId) return;
      setRoom(null);
      const { data: r } = await supabase
        .from("room_content")
        .select("artist_id, tagline, bio, ig_handle, song_id, accent_color, profile_photo")
        .eq("artist_id", artistId)
        .maybeSingle();
      if (r) setRoom(r as Room);
    })();
  }, [artistId]);

  const slug = roster.find((a) => a.id === artistId)?.slug ?? null;

  const set = <K extends keyof Room>(key: K, val: Room[K]) =>
    setRoom((r) => (r ? { ...r, [key]: val } : r));

  const save = useCallback(async () => {
    if (!room) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("room_content")
      .update({
        tagline: room.tagline,
        bio: room.bio,
        ig_handle: room.ig_handle.replace(/^@/, ""),
        song_id: room.song_id,
        accent_color: room.accent_color,
        profile_photo: room.profile_photo,
      })
      .eq("artist_id", room.artist_id);
    setSaving(false);
    setMsg(error ? error.message : "Saved — your room is live.");
  }, [room]);

  const pickPhoto = useCallback(async () => {
    if (!room) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets[0]) return;
    setSaving(true);
    setMsg(null);
    try {
      const asset = res.assets[0];
      const ext = (asset.fileName?.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${room.artist_id}/${Date.now()}-app.${ext}`;
      const file = await fetch(asset.uri);
      const blob = await file.arrayBuffer();
      const { error } = await supabase.storage.from("room-photos").upload(path, blob, {
        contentType: asset.mimeType ?? "image/jpeg",
        upsert: false,
      });
      if (error) {
        setMsg(`Upload failed: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("room-photos").getPublicUrl(path);
      set("profile_photo", data.publicUrl);
      setMsg("Photo ready — tap Save to make it live.");
    } catch {
      setMsg("Could not read that photo.");
    } finally {
      setSaving(false);
    }
  }, [room]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "My Room", headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text }} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        {loading ? (
          <ActivityIndicator color={theme.textDim} style={{ marginTop: 60 }} />
        ) : !artistId ? (
          <Card>
            <Text style={styles.note}>
              No room is linked to this login yet — ask the desk to link your artist profile.
            </Text>
          </Card>
        ) : (
          <>
            {isOwner && roster.length > 0 && (
              <View style={{ marginBottom: 4 }}>
                <Chips
                  label="Whose room"
                  value={artistId}
                  options={roster.map((a) => a.id)}
                  display={(id) => roster.find((a) => a.id === id)?.name ?? id}
                  onChange={(id) => setArtistId(id)}
                />
              </View>
            )}
            <Text style={styles.sub}>
              {isOwner ? "Editing this public page" : "This is your public page"}
              {slug ? ` (lumenati-tattoo.vercel.app/${slug})` : ""}. Changes go live when you save.
            </Text>

            {!room ? (
              <ActivityIndicator color={theme.textDim} style={{ marginTop: 40 }} />
            ) : (
            <>
            <SectionTitle>Identity</SectionTitle>
            <Card>
              <LabeledInput label="Tagline" value={room.tagline} onChange={(v) => set("tagline", v)} placeholder="skater // gamer // bold color tattoos" />
              <LabeledInput label="Instagram handle" value={room.ig_handle} onChange={(v) => set("ig_handle", v)} autoCapitalize="none" placeholder="your.handle" />
              <LabeledInput label="Bio" value={room.bio} onChange={(v) => set("bio", v)} placeholder="Tell them who you are…" />
            </Card>

            <SectionTitle>Profile photo</SectionTitle>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              {room.profile_photo ? (
                <Image source={{ uri: room.profile_photo.startsWith("http") ? room.profile_photo : `https://lumenati-tattoo.vercel.app${room.profile_photo}` }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: theme.textFaint, fontSize: 11 }}>none</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Button label="Choose new photo" tone="ghost" onPress={pickPhoto} disabled={saving} />
              </View>
            </Card>

            <SectionTitle>Room vibe</SectionTitle>
            <Card>
              <Chips
                label="Winamp track"
                value={room.song_id}
                options={SONGS.map((s) => s.id)}
                display={(id) => SONGS.find((s) => s.id === id)?.label ?? id}
                onChange={(v) => set("song_id", v)}
              />
              <Text style={styles.label}>Accent color</Text>
              <View style={styles.swatches}>
                {COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => set("accent_color", c)}
                    style={[styles.swatch, { backgroundColor: c }, room.accent_color === c && styles.swatchOn]}
                  />
                ))}
              </View>
            </Card>

            <View style={{ marginTop: 20, gap: 10 }}>
              <Button label={saving ? "Saving…" : "Save changes"} onPress={save} disabled={saving} />
              {msg ? <Text style={[styles.note, { textAlign: "center" }]}>{msg}</Text> : null}
              <Text style={[styles.note, { textAlign: "center" }]}>
                Polaroids + portfolio curation live in the web editor for now.
              </Text>
            </View>
            </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  sub: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  note: { color: theme.textDim, fontSize: 13.5, lineHeight: 19 },
  label: { color: theme.textDim, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  avatar: { width: 72, height: 72, borderRadius: 14, backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: "#fff", transform: [{ scale: 1.12 }] },
});
