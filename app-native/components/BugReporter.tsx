import { useCallback, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View, Image } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "@/lib/appApi";
import { theme } from "@/lib/theme";

// Floating "Report a bug" pill for the app, mirroring the web admin's. Tapping
// it captures the current screen (best-effort) and opens a sheet for a note,
// then posts to /api/bugs.
//
// Screenshot capture uses react-native-view-shot, a NATIVE module — it only
// works in a build that includes it. The require is guarded so a build without
// it (or an OTA update onto an older binary) degrades to a note-only report
// instead of crashing. Until the next EAS build ships, reports come through
// without an image; the note + screen + role are still captured.
let ViewShot: { captureScreen?: (opts: unknown) => Promise<string> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ViewShot = require("react-native-view-shot");
} catch {
  ViewShot = null;
}
const hasViewShot = !!(ViewShot && typeof ViewShot.captureScreen === "function");

type Phase = "hidden" | "sheet" | "sending" | "done";

export default function BugReporter() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const open = useCallback(async () => {
    setNote("");
    setErr(null);
    let captured: string | null = null;
    if (hasViewShot && ViewShot?.captureScreen) {
      try {
        // jpg + width resize keeps the base64 well under the request limit, so
        // no second native module (image-manipulator) is needed.
        captured = await ViewShot.captureScreen({
          format: "jpg",
          quality: 0.6,
          result: "data-uri",
          width: 900,
        });
      } catch {
        captured = null;
      }
    }
    setShot(captured);
    setPhase("sheet");
  }, []);

  const send = useCallback(async () => {
    if (note.trim().length < 2) {
      setErr("Add a quick note about what went wrong.");
      return;
    }
    setPhase("sending");
    setErr(null);
    const r = await apiPost("/api/bugs", {
      note: note.trim(),
      url: pathname,
      surface: Platform.OS, // ios | android
      screenshot: shot,
      meta: { route: pathname },
    });
    if (!r.ok) {
      setErr(r.error ?? "Could not send — try again.");
      setPhase("sheet");
      return;
    }
    setPhase("done");
    setTimeout(() => setPhase("hidden"), 1800);
  }, [note, pathname, shot]);

  return (
    <>
      <Pressable
        onPress={open}
        style={{
          position: "absolute",
          right: 14,
          bottom: insets.bottom + 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 13,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: "rgba(20,20,28,0.92)",
        }}
      >
        <Text style={{ color: theme.textDim, fontSize: 13 }}>◎</Text>
        <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: "600" }}>Report a bug</Text>
      </Pressable>

      <Modal visible={phase !== "hidden"} transparent animationType="slide" onRequestClose={() => setPhase("hidden")}>
        <Pressable
          onPress={() => setPhase("hidden")}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#15151b",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 18,
              paddingBottom: insets.bottom + 18,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            {phase === "done" ? (
              <Text style={{ color: theme.good, fontSize: 16, fontWeight: "700", textAlign: "center", paddingVertical: 20 }}>
                Thanks — sent.
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>Report a bug</Text>
                  <Pressable onPress={() => setPhase("hidden")} hitSlop={12}>
                    <Text style={{ color: theme.textDim, fontSize: 20 }}>×</Text>
                  </Pressable>
                </View>

                {shot ? (
                  <ScrollView style={{ maxHeight: 220, marginBottom: 12 }}>
                    <Image
                      source={{ uri: shot }}
                      style={{ width: "100%", height: 200, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}
                      resizeMode="contain"
                    />
                  </ScrollView>
                ) : (
                  <Text style={{ color: theme.textFaint, fontSize: 12, marginBottom: 12 }}>
                    No screenshot this time — your note still comes through.
                  </Text>
                )}

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="What went wrong? What were you trying to do?"
                  placeholderTextColor={theme.textFaint}
                  multiline
                  style={{
                    minHeight: 76,
                    color: theme.text,
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    padding: 12,
                    textAlignVertical: "top",
                    backgroundColor: "#0e0e13",
                  }}
                />

                {err ? <Text style={{ color: theme.bad, fontSize: 12, marginTop: 8 }}>{err}</Text> : null}

                <Pressable
                  onPress={send}
                  disabled={phase === "sending"}
                  style={{
                    marginTop: 12,
                    paddingVertical: 13,
                    borderRadius: 12,
                    backgroundColor: theme.brand,
                    opacity: phase === "sending" ? 0.7 : 1,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                    {phase === "sending" ? "Sending…" : "Send report"}
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
