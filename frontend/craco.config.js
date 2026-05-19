module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "util": require.resolve("util/"),
        "zlib": require.resolve("browserify-zlib"),
        "stream": require.resolve("stream-browserify"),
        "url": require.resolve("url/"),
        "crypto": require.resolve("crypto-browserify"),
        "assert": require.resolve("assert/")
      };
      
      // Exclude @google/model-viewer from webpack bundling since it's loaded dynamically via CDN
      // This prevents the AgXToneMapping import error from Three.js version mismatch
      webpackConfig.resolve.alias = {
        ...(webpackConfig.resolve.alias || {}),
        '@google/model-viewer': false // Prevent webpack from trying to bundle model-viewer
      };
      
      // Use IgnorePlugin to completely ignore model-viewer during bundling
      const webpack = require('webpack');
      webpackConfig.plugins = webpackConfig.plugins || [];
      webpackConfig.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@google\/model-viewer$/,
        })
      );
      
      // Disable ESLint during build to avoid plugin issues
      webpackConfig.plugins = webpackConfig.plugins.filter(
        plugin => plugin.constructor.name !== 'ESLintWebpackPlugin'
      );

      // Exclude @mediapipe/tasks-vision from source-map-loader (package ships missing map file).
      const mediapipeRegex = /@mediapipe[\\/]tasks-vision/;
      const patchSourceMapLoaderRule = (rules = []) => {
        rules.forEach((rule) => {
          if (Array.isArray(rule.oneOf)) {
            patchSourceMapLoaderRule(rule.oneOf);
          }
          if (Array.isArray(rule.rules)) {
            patchSourceMapLoaderRule(rule.rules);
          }
          if (typeof rule.loader === 'string' && rule.loader.includes('source-map-loader')) {
            if (Array.isArray(rule.exclude)) {
              rule.exclude.push(mediapipeRegex);
            } else if (rule.exclude) {
              rule.exclude = [rule.exclude, mediapipeRegex];
            } else {
              rule.exclude = [mediapipeRegex];
            }
          }
        });
      };
      patchSourceMapLoaderRule(webpackConfig.module?.rules || []);
      
      return webpackConfig;
    }
  },
  eslint: {
    enable: false
  }
};
