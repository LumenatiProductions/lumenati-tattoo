import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "@/lib/theme";

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
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, value === o && styles.chipOn]}>
            <Text style={[styles.chipText, value === o && { color: "#fff" }]}>{display ? display(o) : o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderColor: theme.border, borderWidth: 1 },
  chipOn: { backgroundColor: theme.brand, borderColor: theme.brand },
  chipText: { color: theme.textDim, fontSize: 13 },
});
