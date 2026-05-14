// Metro config — explicit cache disable.
//
// PR #5's payer picker shipped weeks ago but never reached production because
// Vercel's build produced a duplicate compiled chunk of app/expenses/new.tsx:
// one from a pre-PR#5 snapshot, one from current source. The router resolved
// to the stale one. Local builds were clean only after wiping
// /private/var/folders/.../T/metro-cache, which suggests metro's file-map +
// transform caches are the source.
//
// vercel.json + npm build wipes attempted but didn't fix it — Vercel may
// keep caches in a path we don't know to wipe. Forcing resetCache + empty
// cacheStores here disables persistence at the metro layer entirely.
//
// Slight cold-build cost on every Vercel deploy; acceptable tradeoff for
// determinism. Local dev (expo start) doesn't read this file's resetCache.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resetCache = true;
config.cacheStores = [];

module.exports = config;
