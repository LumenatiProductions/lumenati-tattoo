import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { tapToPayAvailable, getConnectionToken } from "@/lib/terminal";

// Apply the Lumenati brand font (Helvetica Neue) globally so every Text/TextInput
// inherits it without touching each style. Existing per-component styles still win
// for size/weight; only the family is defaulted here.
const TextAny = Text as unknown as { defaultProps?: { style?: unknown } };
const InputAny = TextInput as unknown as { defaultProps?: { style?: unknown } };
TextAny.defaultProps = TextAny.defaultProps || {};
TextAny.defaultProps.style = [{ fontFamily: theme.font }, TextAny.defaultProps.style];
InputAny.defaultProps = InputAny.defaultProps || {};
InputAny.defaultProps.style = [{ fontFamily: theme.font }, InputAny.defaultProps.style];

// Stripe Terminal's provider only exists in real iOS builds — lazy-required so
// Expo Go / web / Android never touch the native module.
function TerminalProvider({ children }: { children: React.ReactNode }) {
  if (!tapToPayAvailable()) return <>{children}</>;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StripeTerminalProvider } = require("@stripe/stripe-terminal-react-native");
  return (
    <StripeTerminalProvider logLevel="error" tokenProvider={getConnectionToken}>
      {children}
    </StripeTerminalProvider>
  );
}

// Root layout: providers + a header-less stack. Auth state lives in AuthProvider
// so every route (and all three targets) shares one session.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
       <TerminalProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: "fade",
          }}
        />
       </TerminalProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
