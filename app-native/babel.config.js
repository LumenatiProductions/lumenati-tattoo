module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo includes the expo-router transform in SDK 52.
  return { presets: ["babel-preset-expo"] };
};
