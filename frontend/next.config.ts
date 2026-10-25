import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // localhost:3000 opens the game; the song pipeline lives at /preview.
  async redirects() {
    return [{ source: "/", destination: "/play", permanent: false }];
  },
  // The baked art's PNG URLs carry ?v=<fingerprint> (art-pipeline.ts), so the file behind one never
  // changes: cache it for good. Not manifest.json, which lists those fingerprints and must stay fresh.
  async headers() {
    return [
      {
        source: "/art/:file([^/]+\\.png)",
        has: [{ type: "query", key: "v" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  turbopack: {
    // Essentia's WASM build has a Node-only branch that requires these.
    // They're never called in the browser, so stub them out there.
    resolveAlias: {
      fs: { browser: "./src/lib/audio/node-stub.js" },
      path: { browser: "./src/lib/audio/node-stub.js" },
      crypto: { browser: "./src/lib/audio/node-stub.js" },
    },
  },
};

export default nextConfig;
