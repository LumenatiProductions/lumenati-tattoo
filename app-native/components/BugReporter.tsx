import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, Image } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "@/lib/appApi";
import { theme } from "@/lib/theme";

// Bug reporter. The real trigger (Cinebody pattern, Scott 2026-07-08) is
// TAKING A SCREENSHOT: the OS screenshot event pops the report sheet with the
// capture attached. The floating "Report a bug" pill only renders as a
// fallback on binaries that can't detect screenshots yet.
//
// Both capture (react-native-view-shot) and screenshot detection
// (expo-screen-capture) are NATIVE modules — they only work in a build that
// includes them. The requires are guarded so a build without them (or an OTA
// update onto an older binary) degrades to the pill + note-only report instead
// of crashing. Both come alive with the next EAS build.
let ViewShot: { captureScreen?: (opts: unknown) => Promise<string> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ViewShot = require("react-native-view-shot");
} catch {
  ViewShot = null;
}
const hasViewShot = !!(ViewShot && typeof ViewShot.captureScreen === "function");

type ScreenshotSub = { remove: () => void };
let ScreenCapture: { addScreenshotListener?: (cb: () => void) => ScreenshotSub } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ScreenCapture = require("expo-screen-capture");
} catch {
  ScreenCapture = null;
}
const hasScreenshotTrigger =
  Platform.OS !== "web" && !!(ScreenCapture && typeof ScreenCapture.addScreenshotListener === "function");

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

  // Screenshot -> report sheet. Subscribing can throw on a binary that ships
  // the JS but not the native module (OTA onto an older build), so it's
  // guarded like the require.
  useEffect(() => {
    if (!hasScreenshotTrigger || !ScreenCapture?.addScreenshotListener) return;
    let sub: ScreenshotSub | null = null;
    try {
      sub = ScreenCapture.addScreenshotListener(() => open());
    } catch {
      sub = null;
    }
    return () => sub?.remove();
  }, [open]);

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
      {/* Fallback pill — only when the binary can't detect screenshots. */}
      {!hasScreenshotTrigger && (
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
      )}

      <Modal visible={phase !== "hidden"} transparent animationType="slide" onRequestClose={() => setPhase("hidden")}>
        {/* The sheet rides above the keyboard, so the note stays visible while
            typing (bug 24e80ad6). */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
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
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
