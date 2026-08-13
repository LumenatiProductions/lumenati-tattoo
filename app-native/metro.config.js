const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// The Stripe Terminal SDK is native-only and its web build doesn't even
// resolve (broken relative package.json import). pos.tsx already gates the
// real POS to real iOS builds — on web we just need Metro to not choke, so
// the module resolves to an empty stub there.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName.startsWith("@stripe/stripe-terminal-react-native")) {
    return { type: "sourceFile", filePath: path.resolve(__dirname, "lib/terminal-web-stub.js") };
  }
  // react-native-view-shot / expo-screen-capture are native-only and don't
  // resolve on web, but BugReporter require()s them at module load (it's in
  // (app)/_layout, so every signed-in web session hits them). Stub them so
  // Metro doesn't choke — the runtime already no-ops screenshot capture on web.
  if (
    platform === "web" &&
    (moduleName === "react-native-view-shot" || moduleName === "expo-screen-capture")
  ) {
    return { type: "sourceFile", filePath: path.resolve(__dirname, "lib/native-web-stub.js") };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
