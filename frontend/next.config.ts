import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // localhost:3000 opens the game; the song pipeline lives at /preview.
  async redirects() {
    return [{ source: "/", destination: "/play", permanent: false }];
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
