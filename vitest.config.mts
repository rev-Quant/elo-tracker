import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    // PGlite boots a WASM Postgres per suite; the default 5s is tight on a
    // cold start.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": new URL("./src/", import.meta.url).pathname },
  },
});
