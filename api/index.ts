// Vercel Node.js function that handles all incoming requests for the
// deployed Expo Router app (SDK 54+). Routes are rewritten to /api/index
// via vercel.json; expo-server's adapter dispatches them against the
// exported server bundle in dist/server.

const { createRequestHandler } = require('expo-server/adapter/vercel');

module.exports = createRequestHandler({
  build: require('path').join(__dirname, '../dist/server'),
});
