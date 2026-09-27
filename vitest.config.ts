import { defineConfig } from "vitest/config";

// Standalone config: the app's vite.config.ts pulls in TanStack Start, Nitro and
// the PGLite bootstrap, none of which the pure engine tests need. The `@` alias
// comes from tsconfig's paths.
//
// Timeouts: booting PGlite takes about 2 s alone and 7 s when four test files
// boot at once, which vitest's defaults (5 s per test, 10 s per hook) do not
// cover on a loaded runner. Boot it in `beforeAll`, never inside a test.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.{ts,tsx,mjs}", "scripts/**/*.test.mjs"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
