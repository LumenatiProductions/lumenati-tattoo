import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
    <View style={styles.wrap}>
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
              value={email}
              onChangeText={setEmail}
            />
            <Button label={busy ? "Sending…" : "Send code"} onPress={sendCode} disabled={busy} />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={theme.textFaint}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            <Button label={busy ? "Verifying…" : "Verify"} onPress={verify} disabled={busy} />
            <Pressable onPress={() => setStep("email")}>
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator color={theme.brand} style={{ marginTop: 12 }} />}
      </View>
    </View>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380 },
  logo: { color: theme.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.textDim, marginTop: 6, marginBottom: 22, fontSize: 15 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  btn: { backgroundColor: theme.brand, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { color: theme.textDim, textAlign: "center", marginTop: 14, fontSize: 14 },
  error: { color: "#fb7185", marginTop: 14, fontSize: 14 },
});
