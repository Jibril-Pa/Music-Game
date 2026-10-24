import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
