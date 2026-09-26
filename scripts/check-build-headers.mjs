#!/usr/bin/env node
/**
 * Checks that the production build carries the security headers from
 * vite.config.ts (nitro routeRules) on every page route. Vercel applies them
 * from .vercel/output/config.json at its edge, so the local test server
 * (serve-built-test.mjs) cannot show them; this reads that file instead.
 * Run after `npm run build`; exits non-zero naming each missing header.
 *
 * Usage: node scripts/check-build-headers.mjs
 */
import { readFile } from "node:fs/promises";

const REQUIRED = {
  "content-security-policy": /frame-ancestors 'self'/,
  "referrer-policy": /^strict-origin-when-cross-origin$/,
  "x-content-type-options": /^nosniff$/,
  "permissions-policy": /camera=\(\)/,
  "strict-transport-security": /max-age=\d+/,
};

const config = JSON.parse(await readFile(".vercel/output/config.json", "utf8"));
const pageRoute = config.routes?.find((route) => route.src === "/(.*)" && route.headers);
const headers = Object.fromEntries(
  Object.entries(pageRoute?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
);
const problems = Object.entries(REQUIRED)
  .filter(([name, pattern]) => !pattern.test(headers[name] ?? ""))
  .map(([name]) => `${name}: ${headers[name] ?? "missing"}`);
if (problems.length) {
  console.error(`[headers] the build's page route lacks:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`[headers] all ${Object.keys(REQUIRED).length} security headers are on every page`);
