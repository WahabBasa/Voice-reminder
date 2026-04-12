module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);

  const plugins = ["react-native-reanimated/plugin"];

  // Only transform dynamic import() in test environment (Jest needs CJS require)
  // Metro handles dynamic imports natively — this plugin breaks it
  if (process.env.NODE_ENV === "test") {
    plugins.unshift("@babel/plugin-transform-dynamic-import");
  }

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
    plugins,
  };
};
