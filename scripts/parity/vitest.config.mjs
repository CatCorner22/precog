import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The locked-report parity harness only. The root vitest.config.ts includes
// src/**/*.test.* and scripts/**/*.test.mjs, so `npm test` never runs this
// file (it needs PARITY and PARITY_DIR). Run it from the repository root:
//   PARITY=dump  PARITY_DIR=<dir> npx vitest run --config scripts/parity/vitest.config.mjs
//   PARITY=check PARITY_DIR=<dir> npx vitest run --config scripts/parity/vitest.config.mjs
// The `@` alias is spelled out because tsconfig.json includes only src/, so
// tsconfig path resolution never reaches a file under scripts/.
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": resolve(root, "src") } },
  test: {
    include: ["scripts/parity/locked-parity-all.test.tsx"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
