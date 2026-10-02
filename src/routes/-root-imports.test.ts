import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The leading "-" keeps this file out of the generated route tree.

const ROOT = resolve(__dirname, "../..");

/** Every source file a file reaches through static, non-type imports, side-effect ones included. */
function staticImports(entry: string): Set<string> {
  const seen = new Set([resolve(ROOT, entry)]);
  const queue = [...seen];
  while (queue.length) {
    const file = queue.shift()!;
    const source = readFileSync(file, "utf8");
    const specifiers: string[] = [];
    for (const match of source.matchAll(
      /^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gm,
    )) {
      if (match[1] || /^\{(\s*type\s[^,}]*,?)*\s*\}$/.test(match[2].trim())) continue;
      specifiers.push(match[3]);
    }
    for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
      specifiers.push(match[1]);
    }
    for (const specifier of specifiers) {
      const target = resolveSpecifier(file, specifier);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return new Set([...seen].map((file) => relative(ROOT, file)));
}

function resolveSpecifier(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const path = base.replace(/\?.*$/, "") + ext;
    if (/\.tsx?$/.test(path) && existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

const ENGINE = [
  "src/lib/precog/practice-context.tsx",
  "src/lib/precog/practice-profile.ts",
  "src/lib/precog/templates/index.ts",
  "src/lib/precog/evidence/cases.ts",
  "src/lib/precog/onboarding/job-catalog-data.ts",
];

describe("pages that need no business", () => {
  it("load without the business engine: the root and the crash screen import none of it", () => {
    const reached = new Set([
      ...staticImports("src/routes/__root.tsx"),
      ...staticImports("src/lib/error-component.tsx"),
    ]);
    expect(ENGINE.filter((file) => reached.has(file))).toEqual([]);
  });

  it("leave the job-title catalog to the setup steps that use it", () => {
    const reached = staticImports("src/routes/index.tsx");
    expect(reached.has("src/lib/precog/onboarding/job-catalog-data.ts")).toBe(false);
  });
});
