/**
 * Deploy configuration that nothing else checks: .env.example must name every
 * environment variable the app and deploy scripts read, and every cron in
 * vercel.json must call a route that exists.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Read but deliberately not in .env.example: set by the platform or the
 * framework, or used only by test and CI tooling.
 */
const NOT_OPERATOR_SETTINGS = [
  /^VERCEL(_|$)/,
  /^TSS_/,
  /^PRECOG_/,
  /^E2E_/,
  /^BROWSER_/,
  /^PREVIEW_THUMBNAIL_/,
  /^(DEV|PROD|SSR|MODE|BASE_URL|NODE_ENV)$/,
];

describe(".env.example", () => {
  it("names every environment variable the server, client and deploy scripts read", async () => {
    const example = await readFile(join(ROOT, ".env.example"), "utf8");
    const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
    const read = await readVariables();
    expect(read.size).toBeGreaterThan(20);
    const missing = [...read.keys()]
      .filter((name) => !documented.has(name))
      .filter((name) => !NOT_OPERATOR_SETTINGS.some((pattern) => pattern.test(name)))
      .map((name) => `${name} (${read.get(name)})`);
    expect(missing).toEqual([]);
  });
});

describe("vercel.json", () => {
  it("schedules only routes that exist", async () => {
    const { crons } = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
    expect(crons.length).toBeGreaterThan(0);
    const routes = new Set();
    for (const file of await sourceFiles(join(ROOT, "src/routes"))) {
      const source = await readFile(file, "utf8");
      for (const m of source.matchAll(/createFileRoute\("([^"]+)"\)/g)) routes.add(m[1]);
    }
    for (const { path } of crons) expect(routes, path).toContain(path);
  });
});

/** Every variable name read in src/ and scripts/, mapped to the first file that reads it. */
async function readVariables() {
  const patterns = [
    /\b(?:env|envInt|envFlag|readEnv)\(\s*"([A-Z][A-Z0-9_]*)"/g,
    /\b(?:process\.env|import\.meta\.env|env)\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/g,
  ];
  const found = new Map();
  const files = [
    ...(await sourceFiles(join(ROOT, "src"))),
    ...(await sourceFiles(join(ROOT, "scripts"))),
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const pattern of patterns)
      for (const m of source.matchAll(pattern))
        if (!found.has(m[1])) found.set(m[1], relative(ROOT, file));
  }
  return found;
}

/** Source files under `dir`, without tests. */
async function sourceFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(ts|tsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}
