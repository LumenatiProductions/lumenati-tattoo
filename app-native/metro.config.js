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
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
