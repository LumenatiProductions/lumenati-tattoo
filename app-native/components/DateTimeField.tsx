import { View } from "react-native";
import { LabeledInput } from "./form";

export type DateTimeProps = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  onDate: (d: string) => void;
  onTime: (t: string) => void;
};

// Base (web + type-check): plain fields. Native gets the wheel pickers via
// DateTimeField.native.tsx, which Metro prefers on iOS/Android.
export default function DateTimeField({ date, time, onDate, onTime }: DateTimeProps) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1.4 }}>
        <LabeledInput label="Date" value={date} onChange={onDate} keyboardType="numeric" placeholder="YYYY-MM-DD" />
      </View>
      <View style={{ flex: 1 }}>
        <LabeledInput label="Time" value={time} onChange={onTime} keyboardType="numeric" placeholder="HH:MM" />
      </View>
    </View>
  );
}
