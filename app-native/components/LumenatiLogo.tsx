import { SvgXml } from "react-native-svg";
import { LUMENATI_ON_DARK } from "./logo-on-dark";

// The Lumenati parent-brand lockup (all-seeing-eye + wordmark) for the app.
// The app is dark-themed, so we use the white-on-dark colorway. Size via
// `width`; the viewBox is 990x1060, so height is derived to preserve aspect.
const ASPECT = 1060 / 990; // height / width

export function LumenatiLogo({ width = 120 }: { width?: number }) {
  return <SvgXml xml={LUMENATI_ON_DARK} width={width} height={width * ASPECT} />;
}
