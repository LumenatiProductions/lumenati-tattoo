import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { theme } from "@/lib/theme";

// The Liquid Ink atmosphere: color bleeding under the glass surfaces, like
// fresh ink under second skin. Mount it behind a screen's ScrollView (fixed,
// content scrolls over it). Opacities stay low on purpose — it's weather, not
// wallpaper; white text has to pass on top of every inch of it. True frosted
// blur (expo-blur) can layer on when the next native build lands; until then
// the glass ladder in theme.ts does the lifting.
export default function InkWash() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="ink-violet" cx="10%" cy="2%" r="72%">
            <Stop offset="0" stopColor="#6d3aa0" stopOpacity="0.30" />
            <Stop offset="1" stopColor="#6d3aa0" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="ink-pink" cx="98%" cy="24%" r="52%">
            <Stop offset="0" stopColor="#ff1493" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#ff1493" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="ink-blue" cx="50%" cy="110%" r="85%">
            <Stop offset="0" stopColor="#2b4a8c" stopOpacity="0.30" />
            <Stop offset="1" stopColor="#2b4a8c" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={theme.bg} />
        <Rect width="100%" height="100%" fill="url(#ink-violet)" />
        <Rect width="100%" height="100%" fill="url(#ink-pink)" />
        <Rect width="100%" height="100%" fill="url(#ink-blue)" />
      </Svg>
    </View>
  );
}
