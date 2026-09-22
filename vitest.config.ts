import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config: the app's vite.config.ts pulls in TanStack Start, Nitro and
// the PGLite bootstrap, none of which the pure engine tests need.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
