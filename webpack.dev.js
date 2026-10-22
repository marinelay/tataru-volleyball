const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { GenerateSW } = require('workbox-webpack-plugin');
const path = require('path');

module.exports = merge(
  {
    ...common,
    // Offline caches must never retain development bundles and their build hashes.
    plugins: common.plugins.filter((plugin) => !(plugin instanceof GenerateSW)),
  },
  {
    mode: 'development',
    devtool: 'inline-source-map',
    devServer: {
      static: { directory: path.join(__dirname, 'dist'), watch: false },
      host: '127.0.0.1',
      port: 8080,
      // Refresh explicitly so editing/building cannot interrupt an active match.
      hot: false,
      liveReload: false,
      client: false,
      setupMiddlewares(middlewares, server) {
        server.app.get('/__reset-game-cache', (request, response) => {
          response.set('Cache-Control', 'no-store');
          response.sendFile(path.join(__dirname, 'dev/reset-game-cache.html'));
        });
        return middlewares;
      },
    },
  }
);
