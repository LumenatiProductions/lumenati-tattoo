import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/appApi";
import { useAuth } from "@/lib/auth";
import { usePreview } from "@/lib/preview";
import { theme } from "@/lib/theme";
import { endStop, success, trouble } from "@/lib/haptics";

// The books tab: a deliberate, physical open/close. Tattoo artists open their
// books and close them, and it should FEEL like throwing a lock — a heavy clunk,
// then a confirming pulse. Closed books route new requests onto the waitlist
// (server-side, /api/artist/books). Renders only when there's a specific artist:
// the artist themselves, or an owner previewing one.
export default function BooksToggle({ artistId: forcedArtistId }: { artistId?: string | null } = {}) {
  const { role, email } = useAuth();
  const { preview } = usePreview();
  const [artistId, setArtistId] = useState<string | null>(null);
  const [closed, setClosed] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);

  const resolveArtist = useCallback(async () => {
    // An explicit artistId wins — My Page has its own roster picker, so the
    // owner editing a chair there manages THAT chair's books.
    if (forcedArtistId) return forcedArtistId;
    if (preview?.artistId) return preview.artistId;
    if (role === "artist" && email) {
      const { data } = await supabase.from("profiles").select("artist_id").eq("email", email).maybeSingle();
      return (data?.artist_id as string | null) ?? null;
    }
    return null;
  }, [role, email, preview, forcedArtistId]);

  useEffect(() => {
    (async () => {
      const id = await resolveArtist();
      setArtistId(id);
      if (!id) return;
      const { data } = await supabase.from("artists").select("books_closed").eq("id", id).maybeSingle();
      setClosed(!!(data as { books_closed?: boolean } | null)?.books_closed);
    })();
  }, [resolveArtist]);

  const toggle = async () => {
    if (!artistId || busy || closed === null) return;
    const next = !closed;
    setBusy(true);
    // The lock: heavy clunk, then a confirming pulse — locked (warn) / freed (good).
    endStop();
    setTimeout(() => (next ? trouble() : success()), 75);
    setClosed(next); // optimistic
    const r = await apiPost<{ booksClosed: boolean; waiting: number }>("/api/artist/books", {
      closed: next,
      artistId,
    });
    setBusy(false);
    if (r.ok && r.data) {
      setClosed(r.data.booksClosed);
      setWaiting(r.data.waiting ?? 0);
    } else {
      setClosed(!next); // roll back
    }
  };

  if (!artistId || closed === null) return null;

  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      style={({ pressed }) => [styles.card, closed ? styles.closed : styles.open, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.lockWrap, { backgroundColor: closed ? "rgba(251,191,36,0.14)" : "rgba(61,220,151,0.14)" }]}>
        <Ionicons name={closed ? "lock-closed" : "lock-open"} size={24} color={closed ? theme.warn : theme.good} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{closed ? "Your books are closed" : "Your books are open"}</Text>
        <Text style={styles.sub}>
          {closed
            ? `New requests join your waitlist${waiting ? ` · ${waiting} waiting` : ""}.`
            : "Clients can request a booking with you."}
        </Text>
      </View>
      <View style={[styles.action, { borderColor: closed ? theme.good : theme.warn }]}>
        <Text style={[styles.actionText, { color: closed ? theme.good : theme.warn }]}>
          {busy ? "…" : closed ? "Open" : "Close"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  open: { borderColor: "rgba(61,220,151,0.4)", backgroundColor: "rgba(61,220,151,0.06)" },
  closed: { borderColor: "rgba(251,191,36,0.4)", backgroundColor: "rgba(251,191,36,0.06)" },
  lockWrap: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { color: theme.text, fontSize: 16, fontWeight: "800" },
  sub: { color: theme.textDim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  action: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  actionText: { fontSize: 14, fontWeight: "800" },
});
