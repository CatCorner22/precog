import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INDUSTRIES, type IndustryId } from "../industry";
import { getIndustryTemplate } from "./index";
import { industrySample, REGISTRY } from "./registry";

describe("industrySample", () => {
  it("carries the same people, knowledge and relations arrays as the built template", () => {
    expect(Object.keys(REGISTRY)).toHaveLength(8);
    for (const { id } of INDUSTRIES) {
      const sample = industrySample(id);
      const built = getIndustryTemplate(id);
      expect(sample.id).toBe(id);
      expect(sample.people).toBe(built.people);
      expect(sample.knowledge).toBe(built.knowledge);
      expect(sample.relations).toBe(built.relations);
    }
  });

  it("falls back to the default industry for an unknown id, as the built template does", () => {
    const unknown = "unknown-industry" as IndustryId;
    const sample = industrySample(unknown);
    const built = getIndustryTemplate(unknown);
    expect(sample.id).toBe("dental");
    expect(sample.people).toBe(built.people);
    expect(sample.knowledge).toBe(built.knowledge);
    expect(sample.relations).toBe(built.relations);
    expect(sample.people).toBe(getIndustryTemplate("dental").people);
  });

  it("keeps scenario ids outside the view and control-failure link vocabulary", () => {
    const viewIds = new Set(["single", "compare", "variables", "cascades", "failure"]);
    for (const [industry, sample] of Object.entries(REGISTRY)) {
      for (const scenario of sample.scenarios) {
        expect(viewIds.has(scenario.id), `${industry}: ${scenario.id}`).toBe(false);
        expect(scenario.id.startsWith("failure:"), `${industry}: ${scenario.id}`).toBe(false);
      }
    }
  });
});

const ROOT = resolve(__dirname, "../../../..");
const PRECOG = "src/lib/precog";

/**
 * Every file under src/lib/precog that a file reaches through static,
 * non-type imports, side-effect ones included. Type-only imports are erased
 * at build time, so they cannot form a runtime loop.
 */
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
      if (target && relative(ROOT, target).startsWith(PRECOG) && !seen.has(target)) {
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

describe("the templates and engines import loop", () => {
  const BUILDER = `${PRECOG}/templates/index.ts`;

  it("is broken: the scope and register-state engines reach the registry, not the builder", () => {
    for (const entry of [`${PRECOG}/scoring/scope.ts`, `${PRECOG}/continuity/register-state.ts`]) {
      const reached = staticImports(entry);
      expect(reached.has(`${PRECOG}/templates/registry.ts`)).toBe(true);
      expect(reached.has(BUILDER)).toBe(false);
    }
  });

  it("stays broken: the registry imports no engine", () => {
    const reached = staticImports(`${PRECOG}/templates/registry.ts`);
    const outside = [...reached].filter(
      (file) => !file.startsWith(`${PRECOG}/templates/`) && file !== `${PRECOG}/industry.ts`,
    );
    expect(outside).toEqual([]);
    expect(reached.has(BUILDER)).toBe(false);
  });
});
