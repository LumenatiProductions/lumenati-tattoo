module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo includes the expo-router transform in SDK 52.
  // Reanimated's plugin must be LAST.
  return { presets: ["babel-preset-expo"], plugins: ["react-native-reanimated/plugin"] };
};
