import { useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { LumenatiLogo } from "@/components/LumenatiLogo";

// Email one-time-code sign-in: no passwords, no deep links, works on iOS,
// Android, and web. Existing staff only (shouldCreateUser: false). The Supabase
// email template must include {{ .Token }} for the 6-digit code.
export default function SignIn() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const resend = async () => {
    setResent(true);
    setTimeout(() => setResent(false), 30000);
    await sendCode();
  };

  const sendCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace("/home");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
      <Pressable onPress={Keyboard.dismiss} style={{ position: "absolute", inset: 0 }} />
      <View style={styles.card}>
        <View style={{ alignItems: "center", marginBottom: 4 }}>
          <LumenatiLogo width={120} />
        </View>
        <Text style={[styles.sub, { textAlign: "center" }]}>
          {step === "email" ? "Sign in to your shop" : `Enter the code sent to ${email}`}
        </Text>

        {!supabaseConfigured && (
          <Text style={styles.error}>Set EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY in .env.</Text>
        )}

        {step === "email" ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="you@shop.com"
              placeholderTextColor={theme.textFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={sendCode}
              value={email}
              onChangeText={setEmail}
            />
            <Button label={busy ? "Sending…" : "Send code"} onPress={sendCode} disabled={busy} />
          </>
        ) : (
          <>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor={theme.textFaint}
              keyboardType="number-pad"
              autoFocus
              textContentType="oneTimeCode"
              value={code}
              onChangeText={setCode}
              maxLength={8}
            />
            <Button label={busy ? "Verifying…" : "Verify"} onPress={verify} disabled={busy} />
            <Pressable onPress={resend} disabled={busy || resent}>
              <Text style={[styles.link, resent && { opacity: 0.4 }]}>
                {resent ? "Code sent — check your email" : "Send a new code"}
              </Text>
            </Pressable>
            <Pressable onPress={() => { setCode(""); setStep("email"); }}>
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator color={theme.brand} style={{ marginTop: 12 }} />}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: 24,
    ...theme.shadow,
  },
  logo: { color: theme.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.textDim, marginTop: 8, marginBottom: 22, fontSize: 15, lineHeight: 21 },
  input: {
    backgroundColor: theme.bg,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.text,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 12,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  btn: { backgroundColor: theme.brand, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: "center", ...theme.glow },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  link: { color: theme.textDim, textAlign: "center", marginTop: 16, fontSize: 14 },
  error: { color: theme.bad, marginTop: 14, fontSize: 14, textAlign: "center" },
});
