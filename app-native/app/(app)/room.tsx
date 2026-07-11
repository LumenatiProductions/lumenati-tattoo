import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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

// Legacy gallery photos live at site-relative paths (/legacy-assets/...);
// new uploads are full Storage URLs. Resolve for the phone.
const SITE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const imgSrc = (src: string) => (src.startsWith("http") ? src : `${SITE}${src}`);

// Mirrors STICKER_CATALOG in lib/admin/render-room.ts — keep the ids in sync.
const STICKERS: { id: string; src: string }[] = [
  { id: "bolt", src: "/legacy-assets/sqsp-013.png" },
  { id: "8ball", src: "/legacy-assets/sqsp-002.png" },
  { id: "skateboard", src: "/legacy-assets/sqsp-015.png" },
  { id: "rainbow", src: "/legacy-assets/sqsp-022.png" },
  { id: "smilie", src: "/legacy-assets/sqsp-014.png" },
  { id: "tongue", src: "/legacy-assets/sqsp-020.png" },
  { id: "stars", src: "/legacy-assets/sqsp-030.png" },
];

// Mirrors GAME_CATALOG in lib/admin/render-room.ts — keep the ids in sync.
// "none" = classic: JD keeps his skate game, everyone else has no arcade.
const GAMES: { id: string; label: string }[] = [
  { id: "none", label: "None" },
  { id: "skate", label: "Ink or Die" },
  { id: "snake", label: "Ink Snake" },
  { id: "bricks", label: "Flash Breaker" },
  { id: "shooter", label: "Sterile!" },
  { id: "pong", label: "Needle Pong" },
  { id: "frogger", label: "Walk-In" },
  { id: "steady", label: "Steady Hand" },
  { id: "shoprush", label: "Shop Rush" },
  { id: "flashmatch", label: "Flash Match" },
];

type Polaroid = { id: string; src: string; caption: string };
type Poster = { id: string; src: string };
type PortfolioItem = { id: string; src: string; alt: string };
type Room = {
  artist_id: string;
  tagline: string;
  bio: string;
  ig_handle: string;
  song_id: string;
  accent_color: string;
  profile_photo: string;
  polaroids: Polaroid[];
  portfolio: PortfolioItem[];
  stickers: string[] | null;
  posters: Poster[] | null;
  game_id: string | null;
  video_url: string | null;
  video_title: string | null;
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

  // Load the selected artist's room whenever the pick changes. select("*")
  // so the arcade fields are optional: until the game_id/video_url migration
  // runs, those sections simply don't render and saves don't touch them.
  const [arcadeReady, setArcadeReady] = useState(false);
  const [titleReady, setTitleReady] = useState(false);
  useEffect(() => {
    (async () => {
      if (!artistId) return;
      setRoom(null);
      const { data: r } = await supabase
        .from("room_content")
        .select("*")
        .eq("artist_id", artistId)
        .maybeSingle();
      if (r) {
        setArcadeReady((r as Record<string, unknown>).game_id !== undefined);
        setTitleReady((r as Record<string, unknown>).video_title !== undefined);
        setRoom({
          ...(r as Room),
          polaroids: (r.polaroids as Polaroid[]) ?? [],
          portfolio: (r.portfolio as PortfolioItem[]) ?? [],
          stickers: (r.stickers as string[] | null) ?? null,
          posters: (r.posters as Poster[] | null) ?? null,
          game_id: (r.game_id as string | null) ?? null,
          video_url: (r.video_url as string | null) ?? null,
          video_title: (r.video_title as string | null) ?? null,
        });
      }
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
        polaroids: room.polaroids,
        portfolio: room.portfolio,
        stickers: room.stickers,
        posters: room.posters,
        ...(arcadeReady ? { game_id: room.game_id, video_url: room.video_url } : {}),
        ...(titleReady ? { video_title: room.video_title?.trim() || null } : {}),
      })
      .eq("artist_id", room.artist_id);
    setSaving(false);
    setMsg(error ? error.message : "Saved — your room is live.");
  }, [room, arcadeReady, titleReady]);

  // Pick from the library and land it in the public room-photos bucket.
  // Square-crops for the profile shot; galleries keep the framing as shot.
  // `onLocal` fires with the picked photo's on-device uri the moment it's
  // chosen, so the UI can show it instantly while the upload runs (bug 24e80ad6).
  const uploadFromLibrary = useCallback(
    async (square: boolean, onLocal?: (uri: string) => void): Promise<string | null> => {
      if (!room) return null;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: square,
        ...(square ? { aspect: [1, 1] as [number, number] } : {}),
      });
      if (res.canceled || !res.assets[0]) return null;
      onLocal?.(res.assets[0].uri);
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
          return null;
        }
        const { data } = supabase.storage.from("room-photos").getPublicUrl(path);
        return data.publicUrl;
      } catch {
        setMsg("Could not read that photo.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [room],
  );

  // Room video: an mp4/mov clip that plays inside the room's media player
  // window. Same public bucket as photos, capped so rooms stay quick.
  const pickVideo = useCallback(async () => {
    if (!room) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"] });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const ext = (asset.fileName?.split(".").pop() ?? "mp4").toLowerCase();
    if (!["mp4", "mov"].includes(ext)) {
      setMsg("Use an mp4 or mov clip.");
      return;
    }
    if (asset.fileSize && asset.fileSize > 60 * 1024 * 1024) {
      setMsg("That clip is over 60MB — trim it down and try again.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const path = `${room.artist_id}/video-${Date.now()}.${ext}`;
      const file = await fetch(asset.uri);
      const blob = await file.arrayBuffer();
      const { error } = await supabase.storage.from("room-photos").upload(path, blob, {
        contentType: asset.mimeType ?? (ext === "mov" ? "video/quicktime" : "video/mp4"),
        upsert: false,
      });
      if (error) {
        setMsg(`Upload failed: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("room-photos").getPublicUrl(path);
      set("video_url", data.publicUrl);
      setMsg("Video uploaded — tap Save to put it in your room.");
    } catch {
      setMsg("Could not read that video.");
    } finally {
      setSaving(false);
    }
  }, [room]);

  // The new profile shot shows up the moment it's picked (local uri with an
  // uploading veil), then swaps to the stored copy when the upload lands.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const pickPhoto = useCallback(async () => {
    const url = await uploadFromLibrary(true, setPhotoPreview);
    setPhotoPreview(null);
    if (!url) return;
    set("profile_photo", url);
    setMsg("Photo's in — tap Save to make it live.");
  }, [uploadFromLibrary]);

  const addPolaroid = useCallback(async () => {
    const url = await uploadFromLibrary(false);
    if (!url || !room) return;
    set("polaroids", [...room.polaroids, { id: `p-${Date.now()}`, src: url, caption: "" }]);
    setMsg("Polaroid added — caption it and tap Save.");
  }, [uploadFromLibrary, room]);

  const addPoster = useCallback(async () => {
    const url = await uploadFromLibrary(false);
    if (!url || !room) return;
    set("posters", [...(room.posters ?? []), { id: `wp-${Date.now()}`, src: url }].slice(0, 4));
    setMsg("Poster up — tap Save to make it live.");
  }, [uploadFromLibrary, room]);

  // ── Flash wall pieces (their own table; the public /flash-wall renders them) ──
  type Flash = { id: string; src: string; title: string; price_cents: number; status: string };
  const [flash, setFlash] = useState<Flash[]>([]);
  const loadFlash = useCallback(async () => {
    if (!artistId) return;
    const { data } = await supabase
      .from("flash_pieces")
      .select("id, src, title, price_cents, status")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false });
    setFlash((data ?? []) as Flash[]);
  }, [artistId]);
  useEffect(() => {
    loadFlash();
  }, [loadFlash]);

  const addFlash = useCallback(async () => {
    const url = await uploadFromLibrary(false);
    if (!url || !artistId) return;
    const { error } = await supabase.from("flash_pieces").insert({ artist_id: artistId, src: url });
    setMsg(error ? error.message : "Pinned to the flash wall — set a price below.");
    loadFlash();
  }, [uploadFromLibrary, artistId, loadFlash]);

  const patchFlash = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      setFlash((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      await supabase.from("flash_pieces").update(patch).eq("id", id);
    },
    [],
  );

  const removeFlash = useCallback(
    async (id: string) => {
      setFlash((p) => p.filter((f) => f.id !== id));
      await supabase.from("flash_pieces").delete().eq("id", id);
    },
    [],
  );

  const addPortfolio = useCallback(async () => {
    const url = await uploadFromLibrary(false);
    if (!url || !room) return;
    set("portfolio", [...room.portfolio, { id: `w-${Date.now()}`, src: url, alt: "" }]);
    setMsg("Added to your portfolio — tap Save to make it live.");
  }, [uploadFromLibrary, room]);

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
              {photoPreview || room.profile_photo ? (
                <View>
                  <Image
                    source={{ uri: photoPreview ?? (room.profile_photo.startsWith("http") ? room.profile_photo : `https://lumenati-tattoo.vercel.app${room.profile_photo}`) }}
                    style={styles.avatar}
                  />
                  {photoPreview ? (
                    <View style={styles.avatarVeil}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.avatar, { alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: theme.textFaint, fontSize: 11 }}>none</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Button label={photoPreview ? "Uploading…" : "Choose new photo"} tone="ghost" onPress={pickPhoto} disabled={saving} />
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
                    style={[styles.swatchWrap, room.accent_color === c && styles.swatchWrapOn]}
                  >
                    <View style={[styles.swatch, { backgroundColor: c }]} />
                  </Pressable>
                ))}
              </View>
            </Card>

            {arcadeReady && (
              <>
                <SectionTitle>Arcade game</SectionTitle>
                <Card>
                  <Text style={styles.note}>
                    The game on your room's desktop — visitors actually play it.
                    {room.game_id === null ? " (None picked yet, so your room stays classic.)" : ""}
                  </Text>
                  <View style={{ marginTop: 8 }}>
                    <Chips
                      value={room.game_id ?? "none"}
                      options={GAMES.map((g) => g.id)}
                      display={(id) => GAMES.find((g) => g.id === id)?.label ?? id}
                      onChange={(id) => set("game_id", id === "none" ? null : id)}
                    />
                  </View>
                  <Button
                    label="Try the games first"
                    tone="ghost"
                    onPress={() => Linking.openURL(`${SITE || "https://lumenati-tattoo.vercel.app"}/arcade/${room.game_id ?? "skate"}`)}
                  />
                </Card>

                <SectionTitle>Room video</SectionTitle>
                <Card>
                  <Text style={[styles.note, { marginBottom: 12 }]}>
                    {room.video_url
                      ? "Your clip plays in the room's media player window."
                      : "Drop a clip into your room's media player window (mp4 or mov, under 60MB)."}
                  </Text>
                  {room.video_url && titleReady ? (
                    <LabeledInput
                      label="Video title"
                      value={room.video_title ?? ""}
                      onChange={(v) => set("video_title", v)}
                      placeholder="my shop tour"
                    />
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button label={saving ? "Uploading…" : room.video_url ? "Replace video" : "Add a video"} tone="ghost" onPress={pickVideo} disabled={saving} />
                    </View>
                    {room.video_url ? (
                      <View style={{ flex: 1 }}>
                        <Button
                          label="Remove"
                          tone="ghost"
                          onPress={() => {
                            set("video_url", null);
                            set("video_title", null);
                            setMsg("Video removed — tap Save to make it official.");
                          }}
                          disabled={saving}
                        />
                      </View>
                    ) : null}
                  </View>
                </Card>
              </>
            )}

            <SectionTitle>Stickers</SectionTitle>
            <Card>
              <Text style={styles.note}>
                Slap up to seven on your walls — tap to toggle.{room.stickers === null ? " (Using the classic set until you pick.)" : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                {STICKERS.map((st) => {
                  const on = (room.stickers ?? []).includes(st.id);
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => {
                        const cur = room.stickers ?? [];
                        set("stickers", on ? cur.filter((x) => x !== st.id) : [...cur, st.id].slice(0, 7));
                      }}
                      style={{
                        padding: 8,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: on ? "rgba(235,240,255,0.6)" : "rgba(255,255,255,0.12)",
                        backgroundColor: on ? "rgba(235,240,255,0.10)" : "transparent",
                      }}
                    >
                      <Image source={{ uri: imgSrc(st.src) }} style={{ width: 52, height: 52 }} resizeMode="contain" />
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <SectionTitle>Wall posters</SectionTitle>
            <Card>
              <Text style={[styles.note, { marginBottom: 12 }]}>
                Up to four, taped to your walls in the designed spots.{room.posters === null ? " (Using the classic set until you add your own.)" : ""}
              </Text>
              <PhotoGrid
                items={(room.posters ?? []).map((pp) => ({ id: pp.id, src: pp.src, text: "" }))}
                textLabel=""
                onText={() => {}}
                onRemove={(id) => set("posters", (room.posters ?? []).filter((x) => x.id !== id))}
                onMove={(id, dir) => set("posters", moveItem(room.posters ?? [], id, dir))}
              />
              <Button label={saving ? "Uploading…" : "Add a poster"} tone="ghost" onPress={addPoster} disabled={saving || (room.posters ?? []).length >= 4} />
            </Card>

            <SectionTitle>Polaroids</SectionTitle>
            <Card>
              <Text style={[styles.note, { marginBottom: 12 }]}>The snapshots taped around your room — you, the crew, the shop life.</Text>
              <PhotoGrid
                items={room.polaroids.map((p) => ({ id: p.id, src: p.src, text: p.caption }))}
                textLabel="Caption"
                onText={(id, text) =>
                  set("polaroids", room.polaroids.map((x) => (x.id === id ? { ...x, caption: text } : x)))
                }
                onRemove={(id) => set("polaroids", room.polaroids.filter((x) => x.id !== id))}
                onMove={(id, dir) => set("polaroids", moveItem(room.polaroids, id, dir))}
              />
              <Button label={saving ? "Uploading…" : "Add a polaroid"} tone="ghost" onPress={addPolaroid} disabled={saving} />
            </Card>

            <SectionTitle>Portfolio</SectionTitle>
            <Card>
              <Text style={[styles.note, { marginBottom: 12 }]}>Your work, in the order the world sees it. Healed-shot approvals land here too.</Text>
              <PhotoGrid
                items={room.portfolio.map((w) => ({ id: w.id, src: w.src, text: w.alt }))}
                textLabel="Describe the piece"
                onText={(id, text) => set("portfolio", room.portfolio.map((x) => (x.id === id ? { ...x, alt: text } : x)))}
                onRemove={(id) => set("portfolio", room.portfolio.filter((x) => x.id !== id))}
                onMove={(id, dir) => set("portfolio", moveItem(room.portfolio, id, dir))}
              />
              <Button label={saving ? "Uploading…" : "Add a piece"} tone="ghost" onPress={addPortfolio} disabled={saving} />
            </Card>

            <SectionTitle>Flash wall</SectionTitle>
            <Card style={{ borderColor: "rgba(255,20,147,0.45)", borderWidth: 1.5, backgroundColor: "rgba(255,20,147,0.05)" }}>
              <Text style={{ color: "#FF1493", fontWeight: "700", fontSize: 13.5, lineHeight: 19, marginBottom: 4 }}>
                Live the second you pin it — no save needed.
              </Text>
              <Text style={[styles.note, { marginBottom: 12 }]}>
                Your flash on the shop's public wall. Mark a piece claimed the moment someone grabs it.
              </Text>
              {flash.length === 0 ? (
                <Text style={[styles.note, { marginBottom: 12 }]}>Nothing pinned yet.</Text>
              ) : (
                <View style={{ gap: 12, marginBottom: 12 }}>
                  {flash.map((f) => (
                    <View key={f.id} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                      <Image source={{ uri: imgSrc(f.src) }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: "#1a1a22" }} />
                      <View style={{ flex: 1 }}>
                        <TextInput
                          value={f.price_cents > 0 ? String(f.price_cents / 100) : ""}
                          onChangeText={(t) => patchFlash(f.id, { price_cents: Math.max(0, Math.round((Number(t) || 0) * 100)) })}
                          placeholder="Price ($)"
                          placeholderTextColor="#6b7280"
                          keyboardType="numeric"
                          style={styles.gridInput}
                        />
                        <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
                          <Text
                            style={[styles.gridAction, f.status === "claimed" && { color: "#fbbf24" }]}
                            onPress={() => patchFlash(f.id, { status: f.status === "claimed" ? "available" : "claimed" })}
                          >
                            {f.status === "claimed" ? "Claimed — tap to relist" : "Available — tap when claimed"}
                          </Text>
                          <Text style={[styles.gridAction, { color: "#fb7185" }]} onPress={() => removeFlash(f.id)}>
                            Remove
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <Button label={saving ? "Uploading…" : "Pin new flash"} tone="ghost" onPress={addFlash} disabled={saving} />
            </Card>

            <View style={{ marginTop: 20, gap: 10 }}>
              <Button label={saving ? "Saving…" : "Save changes"} onPress={save} disabled={saving} />
              {msg ? <Text style={[styles.note, { textAlign: "center" }]}>{msg}</Text> : null}
            </View>
            </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

// Reorder helper: swap the item one slot up or down.
function moveItem<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): T[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// A row-per-photo editor: thumbnail, caption field, up/down/remove. Simple
// beats drag-and-drop on a phone; the order here IS the public order.
function PhotoGrid({
  items,
  textLabel,
  onText,
  onRemove,
  onMove,
}: {
  items: { id: string; src: string; text: string }[];
  textLabel: string;
  onText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  if (items.length === 0) return <Text style={[styles.note, { marginBottom: 12 }]}>Nothing here yet.</Text>;
  return (
    <View style={{ gap: 12, marginBottom: 12 }}>
      {items.map((it, i) => (
        <View key={it.id} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Image source={{ uri: imgSrc(it.src) }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: "#1a1a22" }} />
          <View style={{ flex: 1 }}>
            {textLabel !== "" && (
              <TextInput
                value={it.text}
                onChangeText={(t) => onText(it.id, t)}
                placeholder={textLabel}
                placeholderTextColor="#6b7280"
                style={styles.gridInput}
              />
            )}
            <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
              <Text style={[styles.gridAction, i === 0 && styles.gridActionOff]} onPress={() => onMove(it.id, -1)}>
                Up
              </Text>
              <Text
                style={[styles.gridAction, i === items.length - 1 && styles.gridActionOff]}
                onPress={() => onMove(it.id, 1)}
              >
                Down
              </Text>
              <Text style={[styles.gridAction, { color: "#fb7185" }]} onPress={() => onRemove(it.id)}>
                Remove
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gridInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f4f4f6",
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gridAction: { color: "#9aa2b1", fontSize: 13, fontWeight: "600" },
  gridActionOff: { opacity: 0.3 },
  sub: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  note: { color: theme.textDim, fontSize: 13.5, lineHeight: 19 },
  label: { color: theme.textDim, fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  avatar: { width: 72, height: 72, borderRadius: 14, backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1 },
  avatarVeil: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // Selection ring sits OUTSIDE the tile with a gap, so the whole color stays
  // visible inside it (bug c766010c).
  swatchWrap: { padding: 3, borderRadius: 14, borderWidth: 2, borderColor: "transparent" },
  swatchWrapOn: { borderColor: "#fff" },
  swatch: { width: 34, height: 34, borderRadius: 9 },
});
