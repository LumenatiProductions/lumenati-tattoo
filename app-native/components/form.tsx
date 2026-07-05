import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "@/lib/theme";
import { picked } from "@/lib/haptics";

// Shared form bits for the app's add/edit screens (POS 6e).

export function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "words" | "sentences";
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "sentences"}
        style={styles.input}
      />
    </View>
  );
}

// A horizontal set of single-select chips (category, scope, picker).
export function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
  display,
}: {
  label?: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  display?: (v: T) => string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => {
              if (o !== value) picked();
              onChange(o);
            }}
            style={[styles.chip, value === o && styles.chipOn]}
          >
            <Text style={[styles.chipText, value === o && { color: "#fff" }]}>{display ? display(o) : o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: "600" },
  input: {
    backgroundColor: theme.bg,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  // Selection is a lift, not a pink fill — pink is reserved for money actions.
  chipOn: { backgroundColor: "rgba(235,240,255,0.16)", borderColor: "rgba(235,240,255,0.4)" },
  chipText: { color: theme.textDim, fontSize: 13.5, fontWeight: "600" },
});
