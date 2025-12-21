module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // React Compiler is enabled by default in SDK 54
          // Being explicit here for visibility
        },
      ],
    ],
    plugins: ["react-native-reanimated/plugin"],
  };
};
