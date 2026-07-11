import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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

// Native date/time picking, one consistent component everywhere (bug 9106ca0e).
// Tapping Date drops a REAL month calendar straight into the form — no
// intermediate pill to tap again. Tapping Time drops the wheel. Picking a date
// commits and closes; the time wheel stays until Done so you can spin both
// hands. (Android keeps the system modal pickers, which already behave.)
export default function DateTimeField({ date, time, onDate, onTime }: DateTimeProps) {
  const [show, setShow] = useState<null | "date" | "time">(null);
  const value = combine(date, time);
  const inlineIOS = Platform.OS === "ios";

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1.4 }}>
          <Text style={styles.label}>Date</Text>
          <Pressable
            style={[styles.box, show === "date" && styles.boxOpen]}
            onPress={() => setShow((s) => (s === "date" ? null : "date"))}
          >
            <Text style={styles.val}>{pretty(date)}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Time</Text>
          <Pressable
            style={[styles.box, show === "time" && styles.boxOpen]}
            onPress={() => setShow((s) => (s === "time" ? null : "time"))}
          >
            <Text style={styles.val}>{time || "12:00"}</Text>
          </Pressable>
        </View>
      </View>

      {show && !inlineIOS && (
        <DateTimePicker
          value={value}
          mode={show}
          onChange={(_e, picked) => {
            setShow(null);
            if (picked) (show === "date" ? onDate(fmtDate(picked)) : onTime(fmtTime(picked)));
          }}
        />
      )}

      {show === "date" && inlineIOS && (
        <View style={styles.inlineWrap}>
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            themeVariant="dark"
            accentColor={theme.brand}
            onChange={(_e, picked) => {
              if (picked) onDate(fmtDate(picked));
              setShow(null);
            }}
          />
        </View>
      )}

      {show === "time" && inlineIOS && (
        <View style={styles.inlineWrap}>
          <DateTimePicker
            value={value}
            mode="time"
            display="spinner"
            themeVariant="dark"
            minuteInterval={5}
            onChange={(_e, picked) => {
              if (picked) onTime(fmtTime(picked));
            }}
          />
          <Pressable style={styles.doneBtn} onPress={() => setShow(null)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textDim, fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  box: { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 },
  boxOpen: { borderColor: theme.brand },
  val: { color: theme.text, fontSize: 16 },
  inlineWrap: {
    marginTop: 10,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: theme.surface,
    paddingHorizontal: 6,
    paddingBottom: 4,
    overflow: "hidden",
  },
  doneBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 26, marginBottom: 6, borderRadius: 10, backgroundColor: "rgba(235,240,255,0.12)" },
  doneText: { color: theme.text, fontSize: 14.5, fontWeight: "700" },
});
