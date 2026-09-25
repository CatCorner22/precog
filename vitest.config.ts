import { defineConfig } from "vitest/config";

// Standalone config: the app's vite.config.ts pulls in TanStack Start, Nitro and
// the PGLite bootstrap, none of which the pure engine tests need. The `@` alias
// comes from tsconfig's paths.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.{ts,tsx,mjs}"],
    environment: "node",
  },
});
