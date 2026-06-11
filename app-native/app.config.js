// Dynamic config: Apple granted Tap to Pay with the DEVELOPMENT distribution
// restriction (registered test devices only) until the flow-video review
// passes. So the entitlement rides ONLY dev-profile builds — production/
// TestFlight profiles are not allowed to carry it yet and would fail to sign.
// When Apple lifts the restriction: move the entitlement into the static
// config (or just flip TTP_ENTITLEMENT below to always-on).
const appJson = require("./app.json");

module.exports = () => {
  const config = { ...appJson.expo };
  if (process.env.TTP_ENTITLEMENT === "1") {
    config.ios = {
      ...config.ios,
      entitlements: { "com.apple.developer.proximity-reader.payment.acceptance": true },
    };
  }
  return config;
};
