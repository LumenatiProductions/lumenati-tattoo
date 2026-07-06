import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { theme } from "@/lib/theme";
import type { DateTimeProps } from "./DateTimeField";

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const combine = (date: string, time: string) => {
  const d = new Date(`${date}T${(time || "12:00")}:00`);
  return isNaN(d.getTime()) ? new Date() : d;
};
const pretty = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Native (iOS/Android): tap to open the wheel pickers. Same props as the base.
export default function DateTimeField({ date, time, onDate, onTime }: DateTimeProps) {
  const [show, setShow] = useState<null | "date" | "time">(null);
  const value = combine(date, time);

  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
      <View style={{ flex: 1.4 }}>
        <Text style={styles.label}>Date</Text>
        <Pressable style={styles.box} onPress={() => setShow("date")}>
          <Text style={styles.val}>{pretty(date)}</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Time</Text>
        <Pressable style={styles.box} onPress={() => setShow("time")}>
          <Text style={styles.val}>{time || "12:00"}</Text>
        </Pressable>
      </View>
      {show && (
        <DateTimePicker
          value={value}
          mode={show}
          onChange={(_e, picked) => {
            setShow(null);
            if (picked) (show === "date" ? onDate(fmtDate(picked)) : onTime(fmtTime(picked)));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  box: { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 },
  val: { color: theme.text, fontSize: 16 },
});
